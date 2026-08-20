import { Injectable, Logger } from '@nestjs/common';
import type {
  HistoryQuery,
  HistoryResponse,
  StoredResult,
} from '@perseus/contracts';
import { z } from 'zod';
import { SupabaseService } from '../supabase/supabase.service';

/**
 * The row as the table stores it, parsed rather than assumed.
 *
 * Numeric columns come back as strings from PostgREST — `numeric` has more
 * precision than a JSON number promises — so they are coerced here instead of
 * quietly becoming `"91.20"` three components later.
 */
const RowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(['words', 'quote', 'punctuation', 'numbers', 'code']),
  language: z.enum(['pt-BR', 'en']),
  syntax: z.string().nullable(),
  wpm: z.coerce.number(),
  cpm: z.coerce.number(),
  accuracy: z.coerce.number(),
  consistency: z.coerce.number(),
  duration_ms: z.coerce.number().int(),
  completed_at: z.string(),
});

/**
 * Reads a person their own runs.
 *
 * Through the caller's token, never the service key: the row-level policy that
 * says "your rows and nobody else's" is already written and already tested by
 * the database, and re-implementing it here as a `where user_id = ...` would
 * mean the day somebody forgets that clause is the day the endpoint hands out
 * everybody's history. The policy is the check; this just asks.
 */
@Injectable()
export class HistoryService {
  private readonly logger = new Logger(HistoryService.name);

  constructor(private readonly supabase: SupabaseService) {}

  async read(
    accessToken: string,
    query: HistoryQuery,
  ): Promise<HistoryResponse> {
    if (!this.supabase.enabled) return { entries: [], best: null };

    let request = this.supabase
      .asCaller(accessToken)
      .from('results')
      .select(
        'id, kind, language, syntax, wpm, cpm, accuracy, consistency, duration_ms, completed_at',
      )
      .order('completed_at', { ascending: false })
      .limit(query.limit);

    if (query.kind) request = request.eq('kind', query.kind);

    const { data, error } = await request;
    if (error) {
      this.logger.error(`history read failed: ${error.message}`);
      return { entries: [], best: null };
    }

    const rows = z.array(RowSchema).safeParse(data ?? []);
    if (!rows.success) {
      this.logger.error(
        `history shape changed: ${z.prettifyError(rows.error)}`,
      );
      return { entries: [], best: null };
    }

    const entries: StoredResult[] = rows.data.map((row) => ({
      id: row.id,
      kind: row.kind,
      language: row.language,
      syntax: row.syntax as StoredResult['syntax'],
      wpm: row.wpm,
      cpm: row.cpm,
      accuracy: row.accuracy,
      consistency: row.consistency,
      durationMs: row.duration_ms,
      completedAt: new Date(row.completed_at).toISOString(),
    }));

    return { entries, best: bestOf(entries) };
  }
}

/**
 * The best run in the window, by speed.
 *
 * Derived from the rows already fetched rather than asked for separately: a
 * second query for one number is a second round trip, and "best of what you are
 * looking at" is what somebody reading a history means by best.
 */
function bestOf(entries: readonly StoredResult[]): HistoryResponse['best'] {
  const top = entries.reduce<StoredResult | null>(
    (best, entry) => (best === null || entry.wpm > best.wpm ? entry : best),
    null,
  );
  return top === null ? null : { wpm: top.wpm, accuracy: top.accuracy };
}
