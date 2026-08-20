"use client";

import { MATCH_HISTORY_MAX } from "@perseus/contracts";

/**
 * The browser's own record of which duels are its own.
 *
 * A duel has no account behind it — two friends pick names and race — so there
 * is nowhere on the server to hang "your duels" off. The seat is what lets a
 * refreshed tab walk back into the room it was already in, and the id list is
 * what the history panel asks the server about.
 *
 * Both are conveniences, and both fail softly. Clearing the browser loses the
 * list and not the duels: the rows are still there, and anybody holding a link
 * can still read one back.
 *
 * ---
 *
 * It is written as a subscribable store rather than as a pair of functions
 * somebody calls in an effect. Local storage is state that lives outside React,
 * and the supported way to read outside state is `useSyncExternalStore` — which
 * needs three things this file provides: a subscribe, a snapshot that keeps its
 * identity while nothing changes, and a server snapshot for the render that
 * happens where there is no storage at all.
 */
const SEATS_KEY = "perseus:duel-seats";
const HISTORY_KEY = "perseus:duels";

/** How many rooms a browser can be mid-duel in. Two is generous; ten is silly. */
const SEATS_MAX = 10;

export type Seat = {
  matchId: string;
  slot: number;
  /** Proof of being one of the two players. Meaningless once the room dies. */
  token: string;
  /** Epoch ms, for evicting the oldest rather than an arbitrary one. */
  at: number;
};

/** Seats by invite code: the code is what the URL carries. */
type Seats = Record<string, Seat>;

const listeners = new Set<() => void>();

/**
 * Parsed values, held against the raw string they came from.
 *
 * `useSyncExternalStore` compares snapshots by identity and re-renders forever
 * if a fresh object comes back every time it looks. Caching against the raw
 * text is what makes "nothing changed" observable rather than merely true.
 */
let seatsRaw: string | null = null;
let seatsValue: Seats = {};
let idsRaw: string | null = null;
let idsValue: readonly string[] = [];

/** The empty answer for a render that happens where storage does not exist. */
const NO_IDS: readonly string[] = [];

export function subscribeDuels(listener: () => void): () => void {
  listeners.add(listener);
  // Another tab finishing a duel is a change to the same storage; this is the
  // event that says so.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function seatFor(code: string): Seat | null {
  return readSeats()[code] ?? null;
}

/** The server has no storage, so it has no seat. */
export function noSeat(): Seat | null {
  return null;
}

export function rememberSeat(code: string, seat: Omit<Seat, "at">): void {
  const seats = { ...readSeats(), [code]: { ...seat, at: Date.now() } };
  const kept = Object.entries(seats)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, SEATS_MAX);
  write(SEATS_KEY, Object.fromEntries(kept));
}

export function forgetSeat(code: string): void {
  const seats = readSeats();
  if (!(code in seats)) return;
  const next = { ...seats };
  delete next[code];
  write(SEATS_KEY, next);
}

/** Adds a duel to the history list, newest first, oldest evicted. */
export function rememberMatch(id: string): void {
  const ids = readMatchIds();
  if (ids[0] === id) return;
  write(
    HISTORY_KEY,
    [id, ...ids.filter((other) => other !== id)].slice(0, MATCH_HISTORY_MAX),
  );
}

export function readMatchIds(): readonly string[] {
  const raw = raw_(HISTORY_KEY);
  if (raw !== idsRaw) {
    idsRaw = raw;
    const parsed = parse<unknown>(raw);
    idsValue = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  }
  return idsValue;
}

export function noMatchIds(): readonly string[] {
  return NO_IDS;
}

function readSeats(): Seats {
  const raw = raw_(SEATS_KEY);
  if (raw !== seatsRaw) {
    seatsRaw = raw;
    const parsed = parse<unknown>(raw);
    seatsValue =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Seats)
        : {};
  }
  return seatsValue;
}

function raw_(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Corrupt storage costs the list, not the page.
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode, or a full quota. Neither is a reason to fail a duel.
  }
  for (const listener of listeners) listener();
}
