import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';

/**
 * Uma linha por requisição, com um id que sobrevive até a falha.
 *
 * O log dizia o que deu errado e nada sobre em qual requisição deu, o que serve
 * com um usuário e é inútil na primeira vez que duas pessoas enviam ao mesmo
 * tempo. O id volta na resposta também, então a pessoa cola o do envio que
 * falhou e a gente acha.
 *
 * De propósito não é tracing completo. O que falta quando algo quebra é quase
 * sempre "qual chamada, quanto tempo, qual status" — e isso cabe numa linha sem
 * ter um coletor pra rodar.
 */
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('http');

  intercept(context: ExecutionContext, next: CallHandler) {
    const http = context.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const id = headerId(request) ?? randomUUID();
    request.requestId = id;
    response.setHeader('x-request-id', id);

    const started = process.hrtime.bigint();
    const finish = (outcome: string) => {
      const ms = Number(process.hrtime.bigint() - started) / 1e6;
      this.logger.log(
        `${id} ${request.method} ${redact(request.url)} ${outcome} ${ms.toFixed(1)}ms`,
      );
    };

    return next.handle().pipe(
      tap({
        next: () => finish(String(response.statusCode)),
        // O status ainda não está na resposta quando o filtro não rodou, então
        // o do próprio erro é o honesto de reportar.
        error: (error: unknown) => finish(statusOf(error)),
      }),
    );
  }
}

declare module 'express' {
  interface Request {
    requestId?: string;
  }
}

/**
 * Esconde o token de duelo que o stream de eventos não tem escolha senão pôr na
 * URL — `EventSource` não manda header. Ele autoriza digitar no nome de outra
 * pessoa, então não pode estar numa linha de log que sai por aí colada.
 */
function redact(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

/** Respeita um id setado por proxy, pra uma requisição ser um id de ponta a ponta. */
function headerId(request: Request): string | null {
  const header = request.headers['x-request-id'];
  const value = Array.isArray(header) ? header[0] : header;
  return typeof value === 'string' && value.length > 0 && value.length <= 200
    ? value
    : null;
}

function statusOf(error: unknown): string {
  if (
    typeof error === 'object' &&
    error !== null &&
    'status' in error &&
    typeof error.status === 'number'
  ) {
    return String((error as { status: number }).status);
  }
  return '500';
}
