import { Injectable, Logger } from '@nestjs/common';
import type {
  LeaderboardEntry,
  LeaderboardQuery,
  LeaderboardResponse,
} from '@perseus/contracts';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';

const MS_PER_DAY = 86_400_000;
/**
 * How long a board is served from memory before it is asked for again.
 *
 * A board is a ranking of runs that took a minute each; nobody can tell the
 * difference between it being ten seconds old and current, and every drawer
 * opened used to be a fresh `distinct on` over the whole results table. Short
 * enough that your own new record shows up while you are still looking for it.
 */
const CACHE_MS = 20_000;
/** Ceiling on distinct boards held. Fifteen syntaxes times five kinds and up. */
const CACHE_MAX = 200;

/**
 * The shape the database function returns, parsed rather than assumed.
 *
 * `rpc()` is typed `any` — the client cannot know what a hand-written SQL
 * function returns — and an `any` that walks out of this file would take the
 * type safety of everything downstream with it. Parsing here turns a schema
 * drift into an error at the boundary instead of a wrong number on a board.
 */
const RowSchema = z.object({
  rank: z.coerce.number().int(),
  username: z.string(),
  wpm: z.coerce.number(),
  accuracy: z.coerce.number(),
  achieved_at: z.string(),
});

/**
 * Reads the board through the database function rather than the table.
 *
 * The table is closed by row-level security — you can read your own results and
 * nobody else's — and that is worth keeping. The function is the one deliberate
 * opening: it returns a name, a speed and a date, and no way to walk back from
 * them to anyone's individual runs.
 */
@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);
  private readonly cache = new Map<
    string,
    { until: number; response: LeaderboardResponse }
  >();

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Reads a board, saying whether it is a board or an outage.
   *
   * The failure paths return `unavailable` with no entries rather than an empty
   * list. They used to be the same value, which meant the screen told somebody
   * "be the first to rank" when the truth was "the database did not answer" —
   * an invitation and an apology sharing one shape.
   */
  async read(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    if (!this.supabase.enabled) return { status: 'ok', entries: [] };

    const key = cacheKey(query);
    const now = Date.now();
    const cached = this.cache.get(key);
    if (cached && cached.until > now) return cached.response;

    const response = await this.fetch(query);
    // Outages are not cached: the next reader should find out it came back.
    if (response.status === 'ok') {
      if (this.cache.size >= CACHE_MAX) this.sweep(now);
      this.cache.set(key, { until: now + CACHE_MS, response });
    }
    return response;
  }

  private async fetch(query: LeaderboardQuery): Promise<LeaderboardResponse> {
    const since =
      query.windowDays === null
        ? null
        : new Date(Date.now() - query.windowDays * MS_PER_DAY).toISOString();

    const response: { data: unknown; error: { message: string } | null } =
      await this.supabase.admin().rpc('leaderboard', {
        p_kind: query.kind,
        p_language: query.language,
        // Only code has a syntax; asking for one on a prose board would return
        // nothing rather than everything, which is the wrong kind of empty.
        p_syntax: query.kind === 'code' ? query.syntax : null,
        p_since: since,
        p_limit: query.limit,
      });

    if (response.error) {
      this.logger.error(`leaderboard read failed: ${response.error.message}`);
      return { status: 'unavailable', entries: [] };
    }

    const rows = z.array(RowSchema).safeParse(response.data ?? []);
    if (!rows.success) {
      // The board is decoration on top of a trainer that works without it, so a
      // shape it cannot read is logged and reported unavailable rather than
      // thrown — the run the typist just finished is not worth a 500.
      this.logger.error(
        `leaderboard shape changed: ${z.prettifyError(rows.error)}`,
      );
      return { status: 'unavailable', entries: [] };
    }

    const entries: LeaderboardEntry[] = rows.data.map((row) => ({
      rank: row.rank,
      username: row.username,
      wpm: row.wpm,
      accuracy: row.accuracy,
      achievedAt: new Date(row.achieved_at).toISOString(),
    }));
    return { status: 'ok', entries };
  }

  private sweep(now: number): void {
    for (const [key, entry] of this.cache) {
      if (entry.until <= now) this.cache.delete(key);
    }
    if (this.cache.size >= CACHE_MAX) this.cache.clear();
  }
}

/** Every field the board is scoped by, and nothing else. */
function cacheKey(query: LeaderboardQuery): string {
  const syntax = query.kind === 'code' ? (query.syntax ?? 'mix') : '';
  return [
    query.kind,
    query.language,
    syntax,
    query.windowDays,
    query.limit,
  ].join('|');
}
