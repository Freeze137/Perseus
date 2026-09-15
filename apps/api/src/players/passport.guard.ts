import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PassportService } from './passport.service';

/** O cabeçalho em que um passaporte viaja. */
export const PASSPORT_HEADER = 'x-perseus-passport';

declare module 'express' {
  interface Request {
    /** Preenchido quando veio um passaporte que este servidor assinou. */
    playerId?: string;
  }
}

/**
 * Lê o passaporte do cabeçalho, se houver um válido.
 *
 * Função livre e não guard porque os dois usos precisam de coisas opostas: a
 * identidade exige passaporte, e o envio de resultado apenas o aproveita. Uma
 * corrida anônima continua sendo pontuada e devolvida — o treinador nunca
 * dependeu de conta — ela só não classifica ninguém.
 *
 * O dono de uma corrida sai daqui e nunca do corpo da requisição. Um payload
 * capaz de nomear o próprio autor deixaria qualquer um arquivar corrida no nome
 * de outro, que é o mesmo buraco de deixar escolher a própria pontuação.
 */
export function readPassport(
  request: Request,
  passports: PassportService,
): string | null {
  const raw = request.headers[PASSPORT_HEADER];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return null;

  const separator = value.indexOf('.');
  if (separator <= 0) return null;

  const playerId = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  if (!playerId || !signature) return null;

  return passports.verify({ playerId, signature });
}

/** Para as rotas que não fazem sentido sem saber de quem é a pergunta. */
@Injectable()
export class PassportGuard implements CanActivate {
  constructor(private readonly passports: PassportService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>();
    const playerId = readPassport(request, this.passports);
    if (!playerId) {
      throw new UnauthorizedException({
        code: 'passport_invalid',
        message: 'passaporte ausente ou não emitido por este servidor',
      });
    }
    request.playerId = playerId;
    return true;
  }
}
