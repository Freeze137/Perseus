import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { SupabaseService } from './supabase/supabase.service';

/** The caller, once the token has been checked. */
export type Caller = { userId: string; accessToken: string };

declare module 'express' {
  interface Request {
    caller?: Caller;
  }
}

/**
 * Resolves the bearer token to a user id with Supabase.
 *
 * The owner of a result is taken from here and never from the request body.
 * A payload that could name its own author would let anybody file a run under
 * somebody else's name, which is the same hole as letting them pick their score.
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
