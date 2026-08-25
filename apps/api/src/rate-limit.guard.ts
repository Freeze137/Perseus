import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

export type RateLimitRule = {
  /** Quantas requisições um chamador pode fazer dentro da janela. */
  readonly limit: number;
  readonly windowMs: number;
};

const RATE_LIMIT = 'rate-limit';

/** Declara o orçamento de uma rota. Sem isto, a rota não tem limite. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

/**
 * Limitador de janela fixa guardado na memória deste processo.
 *
 * Ser em memória é primeiro passo deliberado, não descuido. O que está sendo
 * protegido é uma API só escrevendo num banco só, e a alternativa — Redis — é
 * uma peça inteira de infra pra rodar, monitorar e pagar antes de alguém ter
 * abusado de coisa nenhuma. O que isto não sobrevive é escala horizontal: com
 * duas instâncias o orçamento efetivo dobra, e é aí que isto vira contador
 * compartilhado em vez de ser ajustado.
 *
 * Chaveado por id de usuário quando o chamador está autenticado e por endereço
 * quando não está, pra uma rede barulhenta não gastar o orçamento de todo mundo.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  /** Teto do mapa, pra enxurrada de chave única não crescê-lo pra sempre. */
  private static readonly MAX_KEYS = 50_000;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const rule = this.reflector.getAllAndOverride<RateLimitRule | undefined>(
      RATE_LIMIT,
      [context.getHandler(), context.getClass()],
    );
    if (!rule) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const now = Date.now();
    const key = `${context.getHandler().name}:${callerKey(request)}`;

    const entry = this.hits.get(key);
    if (!entry || entry.resetAt <= now) {
      this.sweep(now);
      this.hits.set(key, { count: 1, resetAt: now + rule.windowMs });
      return true;
    }

    entry.count += 1;
    if (entry.count > rule.limit) {
      const retryAfter = Math.ceil((entry.resetAt - now) / 1_000);
      throw new HttpException(
        {
          code: 'rate_limited',
          message: `too many requests — try again in ${retryAfter}s`,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    return true;
  }

  /** Joga fora janela vencida, e a tabela inteira se ela fugir do controle. */
  private sweep(now: number): void {
    if (this.hits.size < RateLimitGuard.MAX_KEYS) {
      if (this.hits.size % 512 !== 0) return;
      for (const [key, entry] of this.hits) {
        if (entry.resetAt <= now) this.hits.delete(key);
      }
      return;
    }
    this.hits.clear();
  }
}

/**
 * Quem está sendo contado.
 *
 * O guard roda depois do AuthGuard nas rotas que têm um, então chamador
 * autenticado é contado como ele mesmo — dividir o endereço do escritório não
 * pode significar dividir o orçamento.
 */
function callerKey(request: Request): string {
  if (request.caller) return `user:${request.caller.userId}`;
  // `ip` respeita o trust-proxy configurado no boot; sem aquilo um deploy atrás
  // de proxy contaria todo chamador como o proxy.
  return `ip:${request.ip ?? 'unknown'}`;
}
