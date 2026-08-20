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
  /** How many requests one caller may make inside the window. */
  readonly limit: number;
  readonly windowMs: number;
};

const RATE_LIMIT = 'rate-limit';

/** Declares the budget for a route. Without it, a route is not limited. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);

/**
 * A fixed-window limiter held in this process's memory.
 *
 * In-memory is a deliberate first move, not an oversight. The thing being
 * protected is a single API writing to one database, and the alternative —
 * Redis — is a whole piece of infrastructure to run, monitor and pay for before
 * anybody has abused anything. What this does not survive is horizontal
 * scaling: with two instances the effective budget doubles, which is the point
 * at which this should become a shared counter rather than be tuned.
 *
 * Keyed by user id when the caller is authenticated, and by address when they
 * are not, so one noisy network cannot spend everybody else's budget.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();
  /** Ceiling on the map, so a flood of unique keys cannot grow it forever. */
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

  /** Drops expired windows, and the whole table if it ever runs away. */
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
 * Who is being counted.
 *
 * The guard runs after AuthGuard on the routes that have one, so an
 * authenticated caller is counted as themselves — sharing an office address
 * should not mean sharing a budget.
 */
function callerKey(request: Request): string {
  if (request.caller) return `user:${request.caller.userId}`;
  // `ip` respects the trust-proxy setting configured at boot; without that a
  // proxied deployment would count every caller as the proxy.
  return `ip:${request.ip ?? 'unknown'}`;
}
