import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import {
  CORPUS_VERSION,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MATCH_COUNTDOWN_MS,
  MATCH_GRACE_MS,
  MATCH_LOBBY_TTL_MS,
  MATCH_MAX_RUN_MS,
  MATCH_PLAYERS,
  type CreateMatch,
  type JoinMatch,
  type Match,
  type MatchCredentials,
  type MatchErrorCode,
  type MatchSummariesResponse,
  type MatchSummary,
  type SessionConfig,
  type SubmitMatchRun,
} from '@perseus/contracts';
import { generate, randomSeed } from '@perseus/corpus';
import { ResultsService } from '../results/results.service';
import {
  MAX_ROOMS,
  MatchRegistryService,
  type Room,
  type RoomPlayer,
} from './match-registry.service';
import { MatchStoreService } from './match-store.service';
import { MatchTokenService } from './match-token.service';

/**
 * How long a finished room stays in memory after it is scored.
 *
 * Long enough for both players to read the scoreboard, refresh the tab, and
 * copy the link — and, when there is no database, long enough that the history
 * list has something to show for the duel that just happened.
 */
const KEEP_AFTER_DONE_MS = 5 * 60_000;

/** A room that died before anybody typed is worth even less time than that. */
const KEEP_AFTER_ABANDONED_MS = 60_000;

/**
 * The duel: the room, the clock, and who won.
 *
 * Everything here is one process's memory plus one write at the end. What it
 * does *not* do is score anything itself — a duel is scored by the same
 * `ResultsService.score` a solo run goes through, replaying each player's
 * timeline against the text the seed regenerates. That is the whole reason the
 * live progress can be casual about being lossy: it decorates, and the result
 * comes from somewhere the client cannot reach.
 *
 * The order of events, since it is spread across four methods and a timer:
 *
 *   create   host opens a room          → 'lobby'
 *   join     the friend takes the code  → 'countdown', starts_at set
 *   (timer)  the countdown runs out     → 'running', keys unlock
 *   finish   somebody reaches the end   → grace period starts for the other
 *   settle   both in, or grace expired  → 'done', winner decided, written down
 */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly registry: MatchRegistryService,
    private readonly tokens: MatchTokenService,
    private readonly store: MatchStoreService,
    private readonly results: ResultsService,
  ) {}

  /**
   * Opens a room and puts the host in slot 1.
   *
   * The seed is drawn here rather than accepted from the host. A client that
   * chose it could generate the text, type it once against a stopwatch, and
   * open the room already knowing every character — which is not cheating the
   * scoring, it is cheating the other person.
   */
  create(payload: CreateMatch): MatchCredentials {
    if (this.registry.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'too many duels are open right now — try again in a minute',
      });
    }

    const config: SessionConfig = {
      language: payload.language,
      kind: payload.kind,
      length: payload.length,
      seed: randomSeed(),
      durationMs: null,
      syntax: payload.kind === 'code' ? (payload.syntax ?? 'mix') : null,
      keyboardLayout: payload.keyboardLayout,
    };

    // Refused here rather than at the countdown: a room whose config produces
    // no text would leave two people staring at an empty screen with the clock
    // already running.
    if (generate(config).length === 0) {
      throw new BadRequestException('that configuration produces no text');
    }

    const now = Date.now();
    const room: Room = {
      id: randomUUID(),
      inviteCode: this.freshCode(),
      config,
      corpusVersion: CORPUS_VERSION,
      createdAt: now,
      state: 'lobby',
      startsAt: null,
      graceEndsAt: null,
      finishedAt: null,
      winnerSlot: null,
      players: [player(1, payload.displayName, now)],
    };

    this.registry.add(room);
    // A room nobody joins is swept rather than left holding a code.
    this.registry.arm(room.id, 'lobby', now + MATCH_LOBBY_TTL_MS, () => {
      if (room.state === 'lobby') this.registry.remove(room.id);
    });

    return {
      match: this.snapshot(room, now),
      slot: 1,
      token: this.tokens.issue(room.id, 1),
    };
  }

  /** The room behind an invite code, for the screen that asks for a name. */
  preview(code: string): Match {
    const room = this.registry.byCode(code);
    if (!room) throw this.gone();
    return this.snapshot(room);
  }

  /**
   * Puts the second player in and starts the countdown.
   *
   * There is no ready check. Both clients already have the text — it is a pure
   * function of the seed they were both handed — so the only thing left to
   * agree on is when to start, and a countdown says that better than a button
   * one person forgets to press.
   */
  join(code: string, payload: JoinMatch): MatchCredentials {
    const room = this.registry.byCode(code);
    if (!room) throw this.gone();

    if (room.state !== 'lobby') {
      throw new ConflictException({
        code: (room.players.length >= MATCH_PLAYERS
          ? 'match_full'
          : 'match_closed') satisfies MatchErrorCode,
        message:
          room.players.length >= MATCH_PLAYERS
            ? 'this duel already has two players'
            : 'this duel is no longer open',
      });
    }

    const now = Date.now();
    const slot = MATCH_PLAYERS;
    room.players.push(player(slot, payload.displayName, now));
    room.state = 'countdown';
    room.startsAt = now + MATCH_COUNTDOWN_MS;

    this.registry.disarm(room.id, 'lobby');
    this.registry.arm(room.id, 'start', room.startsAt, () => {
      if (room.state !== 'countdown') return;
      room.state = 'running';
      this.publish(room);
    });
    // The one case the grace period cannot close: both tabs disappear before
    // anybody finishes, so the clock that would have settled the duel never
    // starts. This is the wall behind that.
    this.registry.arm(room.id, 'max', room.startsAt + MATCH_MAX_RUN_MS, () =>
      this.settle(room),
    );

    this.publish(room);

    return {
      match: this.snapshot(room, now),
      slot,
      token: this.tokens.issue(room.id, slot),
    };
  }

  /**
   * The room as one of its players sees it. Also what a reconnecting tab asks
   * for: the token was stored locally, so a refresh mid-duel rejoins rather
   * than starting over.
   */
  forPlayer(
    id: string,
    token: string | undefined,
  ): { match: Match; slot: number } {
    const { room, slot } = this.authorise(id, token);
    return { match: this.snapshot(room), slot };
  }

  /**
   * Walks out of the duel, and takes the room with it.
   *
   * A duel is two people by definition, so one leaving does not leave a duel
   * behind — it ends one. That is why this settles the room rather than
   * removing a player from it: whatever the state, the other person gets a
   * screen that says the thing is over instead of a bar that stopped moving.
   *
   * `settle` decides what "over" means, and it already knows: if somebody had
   * finished, the duel is scored as it stands and the leaver is the one who did
   * not make it to the end; if nobody had, the room is abandoned and nothing is
   * recorded. There is deliberately no second way to close a room here.
   *
   * Leaving a duel that is already over is not an error. A tab that lost the
   * stream, saw the scoreboard late, and only then hit the button is asking for
   * something that has already happened.
   */
  leave(id: string, token: string | undefined): Match {
    const { room } = this.authorise(id, token);
    if (room.state !== 'done' && room.state !== 'abandoned') this.settle(room);
    return this.snapshot(room);
  }

  /**
   * Publishes a caret position to the other player.
   *
   * Silently ignored outside a running duel rather than refused. A client that
   * is mid-flush when the grace period expires would otherwise get an error for
   * doing exactly what it was told to do, about a message that does not matter.
   */
  progress(id: string, token: string | undefined, index: number): void {
    const { room, player: me } = this.authorise(id, token);
    if (room.state !== 'running') return;
    if (me.finishedAt !== null) return;

    // Monotonic: a late packet must not walk somebody's progress bar backwards.
    if (index <= me.progress) return;
    me.progress = index;

    this.registry.publish(room.id, {
      type: 'progress',
      slot: me.slot,
      index,
      serverNow: Date.now(),
    });
  }

  /**
   * Takes one player's timeline, scores it, and decides whether the duel is
   * over.
   *
   * The timeline is judged by the same code a solo submission goes through —
   * replayed against the regenerated text, checked for a human rhythm, and
   * bounded by a clock the server owns. `startsAt` is that clock here: the run
   * cannot have taken longer than the time since the keys unlocked.
   */
  finish(
    id: string,
    token: string | undefined,
    payload: SubmitMatchRun,
  ): Match {
    const { room, player: me } = this.authorise(id, token);

    if (room.state === 'countdown') {
      throw new BadRequestException({
        code: 'not_started' satisfies MatchErrorCode,
        message: 'the duel has not started yet',
      });
    }
    if (room.state !== 'running') {
      throw new ConflictException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'this duel is already over',
      });
    }
    if (me.finishedAt !== null) {
      throw new ConflictException({
        code: 'already_finished' satisfies MatchErrorCode,
        message: 'you already submitted this duel',
      });
    }

    const now = Date.now();
    const scored = this.results.score(
      {
        config: room.config,
        corpusVersion: room.corpusVersion,
        keystrokes: payload.keystrokes,
      },
      // Non-null: `running` is only ever reached through the countdown timer.
      { issuedAt: room.startsAt!, now },
    );

    me.finishedAt = now;
    me.score = {
      wpm: scored.wpm,
      cpm: scored.cpm,
      accuracy: scored.accuracy,
      consistency: scored.consistency,
      durationMs: scored.durationMs,
    };
    me.progress = Math.max(me.progress, scored.correct + scored.incorrect);

    const others = room.players.filter((other) => other.slot !== me.slot);
    const waiting = others.filter((other) => other.finishedAt === null);

    if (waiting.length === 0) {
      this.settle(room);
      return this.snapshot(room);
    }

    // First one home. The other gets the grace period and not a second longer:
    // the alternative is a closed tab holding the room open forever.
    room.graceEndsAt = now + MATCH_GRACE_MS;
    this.registry.arm(room.id, 'grace', room.graceEndsAt, () =>
      this.settle(room),
    );
    this.publish(room);
    return this.snapshot(room);
  }

  /**
   * Ends the duel and works out who won.
   *
   * Two finishers: the higher wpm, which on one shared text is the same thing
   * as being first, computed from the timeline rather than from whose request
   * arrived first. One finisher: they win, and the other is 'unfinished' —
   * they did not reach the end of the text inside the grace period, which is
   * all that is claimed about them. Nobody: the room died, and nothing is
   * recorded, because nothing happened.
   */
  private settle(room: Room): void {
    if (room.state === 'done' || room.state === 'abandoned') return;

    const finished = room.players.filter((one) => one.score !== null);
    const now = Date.now();

    this.registry.disarm(room.id, 'grace');
    this.registry.disarm(room.id, 'max');
    this.registry.disarm(room.id, 'start');

    if (finished.length === 0) {
      room.state = 'abandoned';
      room.finishedAt = now;
      for (const one of room.players) one.outcome = 'abandoned';
      this.publish(room);
      this.reap(room, KEEP_AFTER_ABANDONED_MS);
      return;
    }

    room.state = 'done';
    room.finishedAt = now;

    if (finished.length === 1) {
      const winner = finished[0];
      room.winnerSlot = winner.slot;
      winner.outcome = 'won';
      for (const one of room.players) {
        if (one.slot !== winner.slot) one.outcome = 'unfinished';
      }
    } else {
      const [first, second] = [...finished].sort(
        (a, b) => (b.score?.wpm ?? 0) - (a.score?.wpm ?? 0),
      );
      if (first.score!.wpm === second.score!.wpm) {
        // Identical to the second decimal. Vanishingly rare and not worth
        // breaking with a tiebreak nobody could see the reasoning of.
        room.winnerSlot = null;
        for (const one of finished) one.outcome = 'draw';
      } else {
        room.winnerSlot = first.slot;
        first.outcome = 'won';
        second.outcome = 'lost';
      }
    }

    this.publish(room);
    // Fire and forget: both players already have the scoreboard, and the write
    // is a record of it rather than a step in producing it.
    void this.store.save(room).catch((error: unknown) => {
      this.logger.error(
        `match ${room.id} not stored: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    this.reap(room, KEEP_AFTER_DONE_MS);
  }

  /**
   * The duels a browser claims as its own, newest first.
   *
   * Rooms still in memory answer for themselves, which is what makes the
   * history work at all when there is no database: the duel that just finished
   * is still here. `status` says which of those two worlds the answer came
   * from, so the interface can say "not stored" instead of "none yet".
   */
  async summaries(ids: readonly string[]): Promise<MatchSummariesResponse> {
    const stored = await this.store.summaries(ids);
    const byId = new Map(stored.map((match) => [match.id, match]));

    for (const id of ids) {
      if (byId.has(id)) continue;
      const room = this.registry.byId(id);
      if (!room || room.state !== 'done') continue;
      byId.set(id, this.summarise(room));
    }

    const matches = [...byId.values()].sort((a, b) =>
      (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''),
    );

    return { status: this.store.enabled ? 'ok' : 'unavailable', matches };
  }

  /** Subscribing is the registry's job; this is here so the controller has one
   * dependency rather than two. */
  subscribe(
    id: string,
    token: string | undefined,
    listener: Parameters<MatchRegistryService['subscribe']>[1],
  ): { unsubscribe: () => void; match: Match; slot: number } {
    const { room, slot } = this.authorise(id, token);
    return {
      unsubscribe: this.registry.subscribe(id, listener),
      match: this.snapshot(room),
      slot,
    };
  }

  /** The room and the player the token speaks for, or an exception. */
  private authorise(
    id: string,
    token: string | undefined,
  ): { room: Room; slot: number; player: RoomPlayer } {
    const room = this.registry.byId(id);
    if (!room) throw this.gone();

    const slot = this.tokens.verify(id, token);
    if (slot === null) {
      throw new UnauthorizedException({
        code: 'match_token' satisfies MatchErrorCode,
        message: 'you are not a player in this duel',
      });
    }

    const found = room.players.find((one) => one.slot === slot);
    if (!found) {
      // A token for a slot nobody occupies: the room was rebuilt, or the token
      // outlived it. Either way it is not a seat at this table.
      throw new UnauthorizedException({
        code: 'match_token' satisfies MatchErrorCode,
        message: 'you are not a player in this duel',
      });
    }

    return { room, slot, player: found };
  }

  private publish(room: Room): void {
    this.registry.publish(room.id, {
      type: 'match',
      match: this.snapshot(room),
    });
  }

  private reap(room: Room, after: number): void {
    this.registry.arm(room.id, 'reap', Date.now() + after, () => {
      this.registry.remove(room.id);
    });
  }

  private snapshot(room: Room, now: number = Date.now()): Match {
    return {
      id: room.id,
      inviteCode: room.inviteCode,
      state: room.state,
      config: room.config,
      corpusVersion: room.corpusVersion,
      createdAt: new Date(room.createdAt).toISOString(),
      startsAt: room.startsAt,
      graceEndsAt: room.graceEndsAt,
      finishedAt: room.finishedAt
        ? new Date(room.finishedAt).toISOString()
        : null,
      winnerSlot: room.winnerSlot,
      players: [...room.players]
        .sort((a, b) => a.slot - b.slot)
        .map((one) => ({
          slot: one.slot,
          displayName: one.displayName,
          joinedAt: new Date(one.joinedAt).toISOString(),
          progress: one.progress,
          finishedAt: one.finishedAt
            ? new Date(one.finishedAt).toISOString()
            : null,
          score: one.score,
          outcome: one.outcome,
        })),
      serverNow: now,
    };
  }

  private summarise(room: Room): MatchSummary {
    return {
      id: room.id,
      inviteCode: room.inviteCode,
      kind: room.config.kind,
      language: room.config.language,
      syntax:
        room.config.kind === 'code' ? (room.config.syntax ?? 'mix') : null,
      state: room.state,
      finishedAt: room.finishedAt
        ? new Date(room.finishedAt).toISOString()
        : null,
      winnerSlot: room.winnerSlot,
      players: room.players.map((one) => ({
        slot: one.slot,
        displayName: one.displayName,
        score: one.score,
        outcome: one.outcome,
      })),
    };
  }

  /**
   * An unused invite code.
   *
   * Collisions are checked rather than assumed away: a billion codes is a lot
   * until two of two hundred live rooms happen to share one, and the person it
   * happens to would be dropped into a stranger's duel.
   */
  private freshCode(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let code = '';
      for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
        code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
      }
      if (!this.registry.hasCode(code)) return code;
    }
    // Thirty-two collisions in a row is not luck, it is a full table.
    throw new ServiceUnavailableException({
      code: 'match_closed' satisfies MatchErrorCode,
      message: 'could not allocate an invite code — try again',
    });
  }

  /** One sentence for every way a room can be missing. */
  private gone(): NotFoundException {
    return new NotFoundException({
      code: 'match_not_found' satisfies MatchErrorCode,
      message: 'this duel does not exist, or it has already ended',
    });
  }
}

function player(slot: number, displayName: string, at: number): RoomPlayer {
  return {
    slot,
    displayName,
    joinedAt: at,
    progress: 0,
    finishedAt: null,
    score: null,
    outcome: null,
  };
}
