import { Injectable, Logger } from '@nestjs/common';
import type {
  Language,
  MatchOutcome,
  MatchState,
  MatchSummary,
  SyntaxChoice,
  TextKind,
} from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import type { Room } from './match-registry.service';

/** The columns as Postgres hands them back. Numerics arrive as strings. */
type MatchRow = {
  id: string;
  invite_code: string;
  state: string;
  kind: string;
  language: string;
  syntax: string | null;
  finished_at: Date | null;
  winner_slot: number | null;
};

type PlayerRow = {
  match_id: string;
  slot: number;
  display_name: string;
  wpm: string | null;
  cpm: string | null;
  accuracy: string | null;
  consistency: string | null;
  duration_ms: number | null;
  outcome: string | null;
};

/**
 * Where a finished duel goes to be remembered.
 *
 * Only finished ones. A room that was opened and never filled, or filled and
 * abandoned before anybody reached the end, is not written at all — the table
 * is a record of duels that happened, and padding it with rooms that did not
 * would make "how many duels have I played" a question about tab management.
 *
 * Every method is safe to call with no database behind it. The duel has already
 * been played by the time anything here runs, and losing its record is a worse
 * outcome than the duel failing would be — but it is not a reason to fail the
 * request that just delivered it.
 */
@Injectable()
export class MatchStoreService {
  private readonly logger = new Logger(MatchStoreService.name);

  constructor(private readonly db: PostgresService) {}

  get enabled(): boolean {
    return this.db.enabled;
  }

  /**
   * Writes the duel and both players together.
   *
   * In one transaction because half a duel is worse than none: a match row
   * with one player would show up in somebody's history as a race against
   * nobody, and there is no second chance to fix it — the room is gone.
   */
  async save(room: Room): Promise<void> {
    if (!this.db.enabled) return;
    if (room.state !== 'done') return;

    try {
      await this.db.transaction(async (run) => {
        await run(
          `insert into public.matches
             (id, invite_code, state, config, corpus_version, kind, language,
              syntax, created_at, started_at, finished_at, winner_slot)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           on conflict (id) do nothing`,
          [
            room.id,
            room.inviteCode,
            room.state,
            JSON.stringify(room.config),
            room.corpusVersion,
            room.config.kind,
            room.config.language,
            room.config.kind === 'code' ? (room.config.syntax ?? 'mix') : null,
            new Date(room.createdAt).toISOString(),
            room.startsAt ? new Date(room.startsAt).toISOString() : null,
            room.finishedAt ? new Date(room.finishedAt).toISOString() : null,
            room.winnerSlot,
          ],
        );

        for (const player of room.players) {
          await run(
            `insert into public.match_players
               (match_id, slot, display_name, joined_at, finished_at,
                wpm, cpm, accuracy, consistency, duration_ms, outcome)
             values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
             on conflict (match_id, slot) do nothing`,
            [
              room.id,
              player.slot,
              player.displayName,
              new Date(player.joinedAt).toISOString(),
              player.finishedAt
                ? new Date(player.finishedAt).toISOString()
                : null,
              player.score?.wpm ?? null,
              player.score?.cpm ?? null,
              player.score?.accuracy ?? null,
              player.score?.consistency ?? null,
              player.score?.durationMs ?? null,
              player.outcome,
            ],
          );
        }
      });
    } catch (error) {
      // Logged and swallowed. The duel is over and both players have their
      // result on screen; throwing here would turn a missing history row into
      // a failed submission for the person who just finished second.
      this.logger.error(
        `could not store match ${room.id}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Reads back the duels a browser says are its own.
   *
   * There is no account to scope this to, so the ids are the scope. That is a
   * real limit and worth naming: anybody who knows a match id can read that
   * match. What it exposes is two chosen nicknames and two speeds — the same
   * thing both players already saw — and the id is a uuid nobody can guess.
   */
  async summaries(ids: readonly string[]): Promise<MatchSummary[]> {
    if (!this.db.enabled || ids.length === 0) return [];

    try {
      const matches = await this.db.query<MatchRow>(
        `select id, invite_code, state, kind, language, syntax,
                finished_at, winner_slot
           from public.matches
          where id = any($1::uuid[])
          order by finished_at desc nulls last`,
        [ids],
      );
      if (matches.length === 0) return [];

      const players = await this.db.query<PlayerRow>(
        `select match_id, slot, display_name, wpm, cpm, accuracy,
                consistency, duration_ms, outcome
           from public.match_players
          where match_id = any($1::uuid[])
          order by slot`,
        [matches.map((match) => match.id)],
      );

      return matches.map((match) => ({
        id: match.id,
        inviteCode: match.invite_code,
        kind: match.kind as TextKind,
        language: match.language as Language,
        syntax: match.syntax as SyntaxChoice | null,
        state: match.state as MatchState,
        finishedAt: match.finished_at
          ? new Date(match.finished_at).toISOString()
          : null,
        winnerSlot: match.winner_slot,
        players: players
          .filter((player) => player.match_id === match.id)
          .map((player) => ({
            slot: player.slot,
            displayName: player.display_name,
            score:
              player.wpm === null
                ? null
                : {
                    wpm: Number(player.wpm),
                    cpm: Number(player.cpm ?? 0),
                    accuracy: Number(player.accuracy ?? 0),
                    consistency: Number(player.consistency ?? 0),
                    durationMs: player.duration_ms ?? 0,
                  },
            outcome: player.outcome as MatchOutcome | null,
          })),
      }));
    } catch (error) {
      this.logger.warn(
        `could not read match history: ${error instanceof Error ? error.message : String(error)}`,
      );
      return [];
    }
  }
}
