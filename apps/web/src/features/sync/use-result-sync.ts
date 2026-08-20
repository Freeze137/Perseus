"use client";

import {
  CORPUS_VERSION,
  RUN_TICKET_TTL_MS,
  type RunTicket,
  type SessionConfig,
  type SubmitResult,
} from "@perseus/contracts";
import type { Session } from "@perseus/engine";
import { isFinished } from "@perseus/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { ApiError, startRun, submitResult } from "@/lib/api";

export type SyncState =
  | "off"
  | "idle"
  | "sending"
  | "sent"
  | "failed"
  /** Kept for later: the network was the problem, not the run. */
  | "queued"
  /** This tab is a deploy behind and cannot be verified until it reloads. */
  | "stale";

/** Where runs wait when the network is not there to take them. */
const QUEUE_KEY = "perseus:pending-results";
/** A queue is a courtesy, not a database. Deep enough for a bad afternoon. */
const QUEUE_MAX = 10;

/**
 * Sends a finished run up for scoring, once.
 *
 * What goes over the wire is the keystroke timeline, not the numbers on screen.
 * The server regenerates the text from the config and derives the result
 * itself, so the figures the typist just read are a local preview of what the
 * server will independently conclude — and if the two ever disagree, the
 * server is right, because it is the one nobody can edit.
 *
 * Two things happen here that used to be one. A ticket is taken out the moment
 * the first character lands, which is what gives the run a server-issued
 * identity and a clock; the submission that follows carries it. And a run the
 * network refused is kept rather than dropped: it goes to a queue in local
 * storage and is offered again on the next visit, because the alternative is
 * losing somebody's personal best to a dropped connection.
 */
export function useResultSync(session: Session, config: SessionConfig): SyncState {
  const { session: auth, configured } = useAuth();
  const [state, setState] = useState<SyncState>(configured ? "idle" : "off");
  const sent = useRef<Session | null>(null);
  /**
   * The ticket for the run in progress, held as the promise rather than the
   * value. A short text finished by a fast typist can beat its own ticket over
   * the network, and a run refused because the paperwork was still in flight
   * would be the most annoying possible way to lose a personal best.
   */
  const ticket = useRef<{
    startedAt: number;
    pending: Promise<RunTicket | null>;
  } | null>(null);
  const token = auth?.access_token ?? null;

  /**
   * Takes out the ticket at the first keystroke.
   *
   * Not when the text is drawn: somebody pressing Escape through five texts
   * looking for one they like would open five runs, and the clock on each would
   * have started before any typing did.
   */
  useEffect(() => {
    if (!configured || !token) return;
    const startedAt = session.startedAt;
    if (startedAt === null) {
      // A reset clears it: the next run is a different run and must not be
      // filed under the ticket of the one that was abandoned.
      ticket.current = null;
      return;
    }
    if (ticket.current?.startedAt === startedAt) return;

    const pending = startRun(token).catch((error: unknown) => {
      // Nothing to show yet — the run is still being typed. The submission
      // below is where the absence of a ticket becomes visible.
      console.warn(`could not open the run: ${describe(error)}`);
      return null;
    });
    ticket.current = { startedAt, pending };
  }, [configured, token, session.startedAt]);

  const deliver = useCallback(
    async (payload: SubmitResult): Promise<SyncState> => {
      if (!token) return "queued";
      try {
        await submitResult(payload, token);
        return "sent";
      } catch (error: unknown) {
        if (!(error instanceof ApiError)) throw error;
        // Already stored is not a failure: a retry after a dropped response
        // lands here, and the run it is asking about is on the board.
        if (error.code === "duplicate") return "sent";
        if (error.code === "corpus_version") return "stale";
        if (error.retryable) {
          enqueue(payload);
          return "queued";
        }
        console.warn(`result not stored: ${error.message}`);
        return "failed";
      }
    },
    [token],
  );

  // Anything left over from a previous visit goes up before anything new does,
  // so a queued personal best is not overtaken on the board by the run that
  // followed it.
  useEffect(() => {
    if (!configured || !token) return;
    let alive = true;

    void (async () => {
      for (const payload of drainQueue()) {
        if (!alive) return;
        const outcome = await deliver(payload);
        // Still no network: it went back on the queue inside `deliver`, and
        // pushing the rest at a connection that is not there wastes the tab's
        // first seconds. Try again next visit.
        if (outcome === "queued") return;
      }
    })();

    return () => {
      alive = false;
    };
  }, [configured, token, deliver]);

  /**
   * Guarded by the session identity rather than a boolean: a re-render, a
   * restart on the same text or a second finish must not file the same run
   * twice.
   */
  useEffect(() => {
    if (!configured || !token) return;
    if (!isFinished(session)) return;
    if (sent.current === session) return;
    sent.current = session;

    const pending = ticket.current?.pending;
    let alive = true;
    setState("sending");

    void (async () => {
      const run = pending ? await pending : null;
      if (!alive) return;
      if (!run) {
        // No ticket, no submission. The run stays on screen and stays honest
        // about not having been filed; inventing a ticket is not on the table.
        setState("failed");
        console.warn("no run ticket for this run — it was not sent");
        return;
      }

      const payload: SubmitResult = {
        config,
        corpusVersion: CORPUS_VERSION,
        run,
        // `correct` is left off: the server recomputes it, and sending it would
        // only invite somebody to try setting it. `at` is rounded to whole
        // milliseconds — the decimals of performance.now() change no score and
        // are a sixth of the size of a long run's request.
        keystrokes: session.keystrokes.map(({ char, at, index }) => ({
          char,
          at: Math.round(at),
          index,
        })),
      };

      const outcome = await deliver(payload);
      if (alive) setState(outcome);
    })();

    return () => {
      alive = false;
    };
  }, [session, config, configured, token, deliver]);

  return state;
}

/** Puts a run aside for the next visit, newest last, oldest evicted. */
function enqueue(payload: SubmitResult): void {
  const queue = readQueue().filter((item) => item.run.id !== payload.run.id);
  queue.push(payload);
  write(queue.slice(-QUEUE_MAX));
}

/**
 * Takes everything worth retrying and empties the store.
 *
 * Tickets that have outlived the server's window are dropped here rather than
 * sent: they would be refused, and a refusal the typist can do nothing about is
 * not worth a request.
 */
function drainQueue(): SubmitResult[] {
  const now = Date.now();
  const queue = readQueue().filter(
    (item) => now - item.run.issuedAt < RUN_TICKET_TTL_MS,
  );
  write([]);
  return queue;
}

function readQueue(): SubmitResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Shape-checked loosely on purpose: the server validates properly, and a
    // corrupted entry should cost one run rather than throw on every load.
    return Array.isArray(parsed) ? (parsed as SubmitResult[]) : [];
  } catch {
    return [];
  }
}

function write(queue: SubmitResult[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // A full or disabled local storage is not a reason to lose the run that is
    // on screen. The queue is a best effort by definition.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
