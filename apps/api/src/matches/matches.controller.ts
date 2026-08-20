import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  CreateMatchSchema,
  InviteCodeSchema,
  JoinMatchSchema,
  MatchProgressSchema,
  MatchSummariesQuerySchema,
  SubmitMatchRunSchema,
  type Match,
  type MatchCredentials,
  type MatchEvent,
  type MatchSummariesResponse,
} from '@perseus/contracts';
import { RateLimit } from '../rate-limit.guard';
import { parse } from '../validation';
import { MatchesService } from './matches.service';

/**
 * How often the stream sends something into a quiet duel.
 *
 * Proxies and load balancers close idle connections, and a lobby waiting for
 * the second player is idle by definition. Sent as a named event so it lands on
 * nobody's `onmessage`.
 */
const PING_MS = 20_000;

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /**
   * Opens a room. Cheap to call and easy to script, hence the tight budget:
   * twenty rooms a minute is more duels than a person can play in an hour.
   */
  @Post()
  @RateLimit({ limit: 20, windowMs: 60_000 })
  create(@Body() body: unknown): MatchCredentials {
    return this.matches.create(parse(CreateMatchSchema, body));
  }

  /**
   * What is behind an invite code, before committing to a name.
   *
   * Declared above the `:id` routes because Nest matches in declaration order
   * and 'code' would otherwise be read as a match id.
   */
  @Get('code/:code')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  preview(@Param('code') code: string): Match {
    return this.matches.preview(parse(InviteCodeSchema, code));
  }

  @Post('code/:code/join')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  join(@Param('code') code: string, @Body() body: unknown): MatchCredentials {
    return this.matches.join(
      parse(InviteCodeSchema, code),
      parse(JoinMatchSchema, body),
    );
  }

  /**
   * The duels this browser says are its own.
   *
   * A POST because the request is a list of ids rather than a filter, and a
   * fifty-uuid query string is a URL nothing wants to log. It reads and it is
   * declared before `:id` for the ordering reason above.
   */
  @Post('history')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async history(@Body() body: unknown): Promise<MatchSummariesResponse> {
    const query = parse(MatchSummariesQuerySchema, body);
    return this.matches.summaries(query.ids);
  }

  /** The room, for a tab that has just reloaded and still holds its token. */
  @Get(':id')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  mine(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') token: string | undefined,
  ): { match: Match; slot: number } {
    return this.matches.forPlayer(id, bearer(authorization) ?? token);
  }

  /**
   * The duel as it happens: state changes and the other player's caret.
   *
   * Server-sent events rather than a socket. The traffic is one-directional —
   * everything the client has to say is a request it already makes — and SSE
   * survives a plain reverse proxy without an upgrade dance, reconnects on its
   * own, and costs no dependency. The price is the token: `EventSource` cannot
   * set headers, so it travels in the query string, which is why the request
   * logger redacts it.
   *
   * The stream is authorised before the observable exists, so a bad token is an
   * ordinary 401 rather than an error inside an already-open stream. It
   * completes once the duel reaches a terminal state; a client that has not
   * closed by then reconnects, receives the same terminal snapshot, and closes.
   */
  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
  ): Observable<MessageEvent> {
    // Throws before any header is written if this is not a player.
    this.matches.forPlayer(id, token);

    return new Observable<MessageEvent>((subscriber) => {
      const { unsubscribe, match } = this.matches.subscribe(
        id,
        token,
        (event: MatchEvent) => {
          subscriber.next({ data: event });
          if (
            event.type === 'match' &&
            (event.match.state === 'done' || event.match.state === 'abandoned')
          ) {
            subscriber.complete();
          }
        },
      );

      // The current state first, so a tab that arrives late or reconnects is
      // never waiting on the next thing to happen to know what is going on.
      subscriber.next({ data: { type: 'match', match } satisfies MatchEvent });

      const ping = setInterval(
        () => subscriber.next({ type: 'ping', data: '' }),
        PING_MS,
      );

      return () => {
        clearInterval(ping);
        unsubscribe();
      };
    });
  }

  /**
   * One caret position. Answered with 204 and nothing else — five of these a
   * second per player is not the place to serialise a room.
   */
  @Post(':id/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 900, windowMs: 60_000 })
  progress(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): void {
    const payload = parse(MatchProgressSchema, body);
    this.matches.progress(id, bearer(authorization), payload.index);
  }

  /** The finished timeline, scored the same way a solo run is. */
  @Post(':id/finish')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  finish(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Match {
    return this.matches.finish(
      id,
      bearer(authorization),
      parse(SubmitMatchRunSchema, body),
    );
  }
}

/**
 * The duel token out of an Authorization header.
 *
 * Every call that can be made with `fetch` carries it here rather than in the
 * query string: a URL is logged, kept in histories and handed to whatever the
 * page links to next, and this one authorises typing in somebody's name. The
 * stream is the exception, because `EventSource` has no way to send a header.
 */
function bearer(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : undefined;
}
