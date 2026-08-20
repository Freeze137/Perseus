import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import {
  CORPUS_VERSION,
  LEADERBOARD_MIN_ACCURACY,
  TIMELINE_LIMITS,
  type SubmitErrorCode,
  type SubmitResult,
  type TypingResult,
} from '@perseus/contracts';
import { generate } from '@perseus/corpus';
import {
  checkTimeline,
  isFinished,
  metrics,
  replay,
  ReplayError,
} from '@perseus/engine';
import { SupabaseService } from '../supabase/supabase.service';
import { RunTicketService } from '../runs/run-ticket.service';

/** Postgres' unique-violation code, which is how a repeat submission arrives. */
const UNIQUE_VIOLATION = '23505';

/**
 * What the server knows about when a run really happened.
 *
 * The ticket's timestamp is the server's own clock; `now` is the server's clock
 * at submission. Between them they bound how much time can possibly have passed
 * while the typing was going on, which is the only part of the client's timeline
 * that can be checked against something the client does not control.
 */
export type RunAnchor = { readonly issuedAt: number; readonly now: number };

/**
 * Everything scoring actually reads: a text to regenerate and a timeline to
 * replay against it.
 *
 * Narrower than SubmitResult on purpose. A duel is scored by exactly this code
 * and has no run ticket to offer — the room is what gives it an identity and a
 * clock — so the signature says what the work needs rather than naming the one
 * caller that happens to carry more.
 */
export type Scoreable = Pick<
  SubmitResult,
  'config' | 'corpusVersion' | 'keystrokes'
>;

/**
 * The gate between a claim and a record.
 *
 * A submission is a timeline, not a score. This regenerates the text the run
 * was supposed to be typing, replays the timeline against it, and derives the
 * numbers here. Anything the client believed about its own speed is discarded
 * on the way in — which is the only reason a shared leaderboard is worth
 * showing anybody.
 *
 * Replaying proves the characters. It says nothing about the clock, and the
 * clock is still the client's: `checkTimeline` is what stands between a correct
 * replay and any speed a forger cares to name. Neither one can tell a patient
 * script typing at a human rate from a human, and no arrangement of these
 * checks would — that is a property of the problem, not a gap in the code.
 */
@Injectable()
export class ResultsService {
  private readonly logger = new Logger(ResultsService.name);

  constructor(
    private readonly supabase: SupabaseService,
    private readonly tickets: RunTicketService,
  ) {}

  async submit(userId: string, payload: SubmitResult): Promise<TypingResult> {
    const now = Date.now();
    const ticket = this.tickets.verify(payload.run, now);
    if (!ticket.ok) throw refuse('run_ticket', ticket.reason);

    const scored = this.score(payload, { issuedAt: ticket.issuedAt, now });

    const { data, error } = await this.supabase
      .admin()
      .from('results')
      .insert({
        user_id: userId,
        run_id: payload.run.id,
        // Two runs of the same text at the same speeds are possible; the same
        // timeline to the millisecond is a recording being filed twice.
        timeline_hash: timelineHash(userId, payload),
        config: payload.config,
        corpus_version: payload.corpusVersion,
        kind: payload.config.kind,
        language: payload.config.language,
        syntax:
          payload.config.kind === 'code'
            ? (payload.config.syntax ?? 'mix')
            : null,
        wpm: scored.wpm,
        cpm: scored.cpm,
        raw_wpm: scored.rawWpm,
        accuracy: scored.accuracy,
        consistency: scored.consistency,
        correct: scored.correct,
        incorrect: scored.incorrect,
        duration_ms: scored.durationMs,
        completed_at: scored.completedAt,
      })
      .select('id')
      .single();

    if (error) {
      if (error.code === UNIQUE_VIOLATION) {
        // Not an error the typist caused: a retry after a dropped response
        // lands here, and so does a second tab finishing the same run.
        throw new ConflictException({
          code: 'duplicate' satisfies SubmitErrorCode,
          message: 'this run was already stored',
        });
      }
      this.logger.error(`insert failed: ${error.message}`);
      throw new BadRequestException('could not store the result');
    }

    return { id: data.id as string, ...scored };
  }

  /**
   * Replays, judges and scores a submission. Pure — no database, so it is the
   * part that can be tested without one.
   *
   * `anchor` is optional so the scoring can be exercised on its own, but the
   * HTTP path always passes it: without it the only clock in the room is the
   * one the submitter wrote.
   */
  score(payload: Scoreable, anchor?: RunAnchor): Omit<TypingResult, 'id'> {
    // An old corpus produces different text for the same seed, so a submission
    // claiming a version this build cannot regenerate cannot be verified. It is
    // refused rather than stored against text nobody can reproduce.
    if (payload.corpusVersion !== CORPUS_VERSION) {
      throw new BadRequestException({
        code: 'corpus_version' satisfies SubmitErrorCode,
        message: `corpus version ${payload.corpusVersion} cannot be verified by this server (expected ${CORPUS_VERSION})`,
        expected: CORPUS_VERSION,
      });
    }

    const target = generate(payload.config);
    if (target.length === 0) {
      throw refuse('invalid_timeline', 'that config produces no text');
    }

    let session;
    try {
      session = replay(
        target,
        // `correct` is filled in by the replay against the real target.
        payload.keystrokes.map((k) => ({ ...k, correct: false })),
        { autoIndent: payload.config.kind === 'code' },
      );
    } catch (error) {
      if (error instanceof ReplayError)
        throw refuse('invalid_timeline', error.message);
      throw error;
    }

    if (!isFinished(session)) {
      throw refuse(
        'invalid_timeline',
        'the run did not reach the end of the text',
      );
    }

    // Judged before it is scored. Deriving numbers from a timeline no hand
    // produced and then deciding what to do with them would leave the decision
    // to whatever the numbers happened to be.
    const verdict = checkTimeline(session.keystrokes, TIMELINE_LIMITS);
    if (!verdict.ok) throw refuse('implausible', verdict.reason);

    const stats = metrics(session, session.finishedAt ?? 0);
    if (!Number.isFinite(stats.wpm) || stats.elapsedMs <= 0) {
      throw refuse('implausible', 'the timeline has no duration');
    }

    if (anchor) {
      // The one check the client cannot write its way around: however the
      // timeline is dressed, the run cannot have lasted longer than the wall
      // clock this server watched between handing out the ticket and being
      // handed the result.
      const watched = anchor.now - anchor.issuedAt;
      if (stats.elapsedMs > watched + TIMELINE_LIMITS.clockSlackMs) {
        throw refuse(
          'implausible',
          'the run claims more time than passed since it started',
        );
      }
    }

    return {
      config: payload.config,
      corpusVersion: payload.corpusVersion,
      wpm: round(stats.wpm),
      cpm: round(stats.cpm),
      rawWpm: round(stats.rawWpm),
      accuracy: round(stats.accuracy),
      consistency: round(stats.consistency),
      correct: stats.correct,
      incorrect: stats.incorrect,
      durationMs: Math.round(stats.elapsedMs),
      // The moment the server accepted it, not a moment the client named. A
      // client-set completion time is a client-set position on a daily board.
      completedAt: new Date().toISOString(),
    };
  }

  /** Whether a scored run is good enough to appear on a board. */
  static ranks(result: Pick<TypingResult, 'accuracy'>): boolean {
    return result.accuracy >= LEADERBOARD_MIN_ACCURACY;
  }
}

function refuse(code: SubmitErrorCode, message: string): BadRequestException {
  return new BadRequestException({ code, message });
}

/**
 * A fingerprint of the run itself, scoped to its owner.
 *
 * The user id is inside the hash so that two people who happen to produce the
 * same timeline — short text, identical rhythm — do not block each other, while
 * one person replaying their own recorded run collides with themselves.
 */
function timelineHash(userId: string, payload: SubmitResult): string {
  const timeline = payload.keystrokes
    .map((k) => `${k.index}:${k.at}:${k.char}`)
    .join('|');
  return createHash('sha256')
    .update(`${userId}|${JSON.stringify(payload.config)}|${timeline}`)
    .digest('hex');
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
