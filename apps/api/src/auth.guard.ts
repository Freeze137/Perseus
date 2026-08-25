import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseService } from './supabase/supabase.service';

/** Quem chamou, depois de o token ter sido conferido. */
export type Caller = { userId: string; accessToken: string };

declare module 'express' {
  interface Request {
    caller?: Caller;
  }
}

/**
 * Resolve o token bearer pra um id de usuário com o Supabase.
 *
 * O dono de um resultado sai daqui e nunca do corpo da requisição. Um payload
 * que pudesse nomear o próprio autor deixaria qualquer um arquivar corrida no
 * nome de outro, que é o mesmo buraco de deixar escolher a própria pontuação.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly supabase: SupabaseService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('missing bearer token');

    const userId = await this.supabase.userIdFrom(token);
    if (!userId) throw new UnauthorizedException('invalid or expired token');

    request.caller = { userId, accessToken: token };
    return true;
  }
}
