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
 * One line per request, with an id that survives into the failure.
 *
 * The logs used to say what went wrong and nothing about which request it went
 * wrong in, which is fine with one user and useless the first time two people
 * submit at once. The id goes back on the response as well, so a person can
 * paste the one from their failed submission and have it found.
 *
 * Deliberately not a full tracing setup. What is missing when something breaks
 * is almost always "which call, how long, what status" — and that fits on a
 * line without a collector to run.
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
        // The status is not on the response yet when the filter has not run, so
        // the error's own is the honest one to report.
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
 * Hides the duel token that the event stream has no choice but to put in its
 * URL — `EventSource` cannot send a header. It authorises typing in somebody
 * else's name, so it does not belong in a log line that gets pasted around.
 */
function redact(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

/** Honours an id set by a proxy, so one request is one id end to end. */
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
