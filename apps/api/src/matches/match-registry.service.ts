import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type {
  MatchEvent,
  MatchOutcome,
  MatchScore,
  MatchState,
  SessionConfig,
} from '@perseus/contracts';

/** One player, as the room holds them while the duel is being played. */
export type RoomPlayer = {
  readonly slot: number;
  readonly displayName: string;
  readonly joinedAt: number;
  /** Last published caret index. Decoration — never an input to the score. */
  progress: number;
  finishedAt: number | null;
  score: MatchScore | null;
  outcome: MatchOutcome | null;
};

/** A duel in progress. Epoch milliseconds throughout; ISO is for the wire. */
export type Room = {
  readonly id: string;
  readonly inviteCode: string;
  readonly config: SessionConfig;
  readonly corpusVersion: number;
  readonly createdAt: number;
  state: MatchState;
  startsAt: number | null;
  graceEndsAt: number | null;
  finishedAt: number | null;
  winnerSlot: number | null;
  players: RoomPlayer[];
};

/**
 * Ceiling on how many rooms exist at once.
 *
 * A room is a few hundred bytes and two open responses, so this is not about
 * memory — it is about the free-tier box this is meant to run on staying
 * answerable if somebody scripts the create endpoint. The rate limiter is the
 * first line; this is the wall behind it.
 */
export const MAX_ROOMS = 200;

/**
 * Every live duel, and everyone listening to one.
 *
 * Deliberately in memory. A duel is two people for ninety seconds: the room is
 * born, watched by exactly two connections, and dies. Putting that in Postgres
 * would be a row written and deleted for every abandoned lobby, a poll or a
 * LISTEN to get it back out, and a schema in the way of every change to the
 * flow — for state whose whole lifetime is shorter than the deploy that would
 * lose it. What is worth keeping is the *finished* duel, and that is a single
 * write at the end, in the store next door.
 *
 * The consequence, since it is the kind of thing that should be written down
 * rather than discovered: this does not survive a restart, and it does not
 * survive a second instance. A duel in progress during a deploy ends as
 * abandoned, and two API processes behind one load balancer would put the two
 * players in two different rooms. One process is the deployment this assumes;
 * anything more needs a shared channel, not a bigger map.
 */
@Injectable()
export class MatchRegistryService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly codes = new Map<string, string>();
  private readonly listeners = new Map<
    string,
    Set<(event: MatchEvent) => void>
  >();
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();

  get size(): number {
    return this.rooms.size;
  }

  add(room: Room): void {
    this.rooms.set(room.id, room);
    this.codes.set(room.inviteCode, room.id);
  }

  byId(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  byCode(code: string): Room | null {
    const id = this.codes.get(code);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  hasCode(code: string): boolean {
    return this.codes.has(code);
  }

  /** Every room, for the sweeps that ask about age rather than identity. */
  all(): Room[] {
    return [...this.rooms.values()];
  }

  remove(id: string): void {
    const room = this.rooms.get(id);
    if (!room) return;
    this.clearTimers(id);
    this.codes.delete(room.inviteCode);
    this.rooms.delete(id);
    // Listeners are dropped rather than closed: the controller completes its
    // own stream when the match reaches a terminal state, and a stream that
    // outlives its room simply stops receiving.
    this.listeners.delete(id);
  }

  /**
   * Starts listening to a room. The returned function stops.
   *
   * Fan-out is a plain Set of callbacks rather than an rxjs Subject per room
   * because the controller already owns the Observable it hands to Nest, and
   * two layers of subscription management would only be two places for a leak.
   */
  subscribe(id: string, listener: (event: MatchEvent) => void): () => void {
    const set = this.listeners.get(id) ?? new Set();
    set.add(listener);
    this.listeners.set(id, set);

    return () => {
      const current = this.listeners.get(id);
      if (!current) return;
      current.delete(listener);
      if (current.size === 0) this.listeners.delete(id);
    };
  }

  /** How many connections are watching. Zero means both tabs are gone. */
  watchers(id: string): number {
    return this.listeners.get(id)?.size ?? 0;
  }

  publish(id: string, event: MatchEvent): void {
    const set = this.listeners.get(id);
    if (!set) return;
    for (const listener of set) listener(event);
  }

  /**
   * Schedules something for this room, replacing whatever was armed under the
   * same name.
   *
   * Named rather than anonymous so re-arming is idempotent: a second player
   * joining twice, or a grace period being recalculated, must not leave two
   * timers racing to settle the same duel.
   */
  arm(id: string, name: string, at: number, fire: () => void): void {
    const room = this.timers.get(id) ?? new Map<string, NodeJS.Timeout>();
    const existing = room.get(name);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(fire, Math.max(0, at - Date.now()));
    // Unreferenced so a pending duel timer cannot hold the process — or a test
    // runner — open past the work it is there for.
    timer.unref?.();
    room.set(name, timer);
    this.timers.set(id, room);
  }

  disarm(id: string, name: string): void {
    const room = this.timers.get(id);
    const timer = room?.get(name);
    if (!timer) return;
    clearTimeout(timer);
    room!.delete(name);
  }

  clearTimers(id: string): void {
    const room = this.timers.get(id);
    if (!room) return;
    for (const timer of room.values()) clearTimeout(timer);
    this.timers.delete(id);
  }

  onModuleDestroy(): void {
    for (const id of [...this.rooms.keys()]) this.clearTimers(id);
    this.rooms.clear();
    this.codes.clear();
    this.listeners.clear();
  }
}
