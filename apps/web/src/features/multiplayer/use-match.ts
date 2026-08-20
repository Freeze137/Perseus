"use client";

import { MatchEventSchema, type Match } from "@perseus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, matchStreamUrl, readMatch } from "@/lib/api";

export type MatchLink = {
  match: Match | null;
  /** Which player this browser is. Null until the room answers. */
  slot: number | null;
  /** Whether the event stream is currently open. */
  connected: boolean;
  /** Set when the room refused us or is gone. Terminal — no retry will help. */
  error: string | null;
  /**
   * The server's clock, as well as this browser can tell.
   *
   * Every snapshot carries the server's `serverNow`, and the difference against
   * the local clock is kept here. It is off by however long the message took to
   * arrive — tens of milliseconds on the connections this is for — and that is
   * accepted rather than corrected: the alternative is a round-trip estimate
   * whose error is the same size. What it buys is the thing that matters, which
   * is that two browsers whose system clocks disagree by a minute still count
   * the same countdown.
   */
  serverNow: () => number;
  /**
   * Takes a snapshot the caller got from somewhere else.
   *
   * There is one: the response to submitting a finished run, which carries the
   * settled room. The stream normally delivers the same thing a moment later,
   * and this is what keeps the screen correct in the case where it does not —
   * a dropped connection at the exact moment the duel ends.
   */
  apply: (match: Match) => void;
};

/**
 * Holds one duel: the room's state, kept current, and the other player's caret.
 *
 * The stream is server-sent events rather than a socket, for the reasons on the
 * API side. What matters here is that it is *only* a view. Nothing this hook
 * receives is trusted with a score — progress moves a bar, and the result
 * arrives as a snapshot the server wrote after replaying both timelines.
 */
export function useMatch(
  matchId: string | null,
  token: string | null,
): MatchLink {
  const [match, setMatch] = useState<Match | null>(null);
  const [slot, setSlot] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const offset = useRef(0);

  const serverNow = useCallback(() => Date.now() + offset.current, []);

  const apply = useCallback((next: Match) => {
    offset.current = next.serverNow - Date.now();
    setMatch((current) =>
      // Snapshots are ordered by the server's own clock, so an older one
      // arriving late is dropped rather than allowed to reopen a finished duel.
      current && current.serverNow > next.serverNow ? current : next,
    );
  }, []);

  useEffect(() => {
    if (!matchId || !token) return;

    let alive = true;
    const take = (next: Match) => {
      offset.current = next.serverNow - Date.now();
      setMatch(next);
    };

    // The stream opens with a snapshot of its own, so this is not strictly
    // needed — but it is the request that reports a dead room or a stale token
    // as an ordinary error, where the stream would only fail to open.
    readMatch(matchId, token)
      .then((seat) => {
        if (!alive) return;
        take(seat.match);
        setSlot(seat.slot);
      })
      .catch((cause: unknown) => {
        if (!alive) return;
        setError(
          cause instanceof ApiError
            ? cause.message
            : "não foi possível entrar na sala",
        );
      });

    const source = new EventSource(matchStreamUrl(matchId, token));

    source.onopen = () => {
      if (alive) setConnected(true);
    };

    source.onmessage = (event: MessageEvent<string>) => {
      if (!alive) return;
      let payload: unknown;
      try {
        payload = JSON.parse(event.data);
      } catch {
        return;
      }
      const parsed = MatchEventSchema.safeParse(payload);
      if (!parsed.success) return;

      if (parsed.data.type === "match") {
        take(parsed.data.match);
        // A finished duel has nothing left to say, and a completed stream would
        // otherwise be reopened by EventSource's own reconnect.
        if (
          parsed.data.match.state === "done" ||
          parsed.data.match.state === "abandoned"
        ) {
          source.close();
          setConnected(false);
        }
        return;
      }

      // A caret moved. Patched in place rather than asking for a new snapshot:
      // this arrives five times a second per player and changes one number.
      const { slot: moved, index, serverNow: at } = parsed.data;
      offset.current = at - Date.now();
      setMatch((current) =>
        current
          ? {
              ...current,
              players: current.players.map((player) =>
                player.slot === moved && index > player.progress
                  ? { ...player, progress: index }
                  : player,
              ),
            }
          : current,
      );
    };

    source.onerror = () => {
      if (alive) setConnected(false);
      // No manual retry: EventSource reconnects on its own for anything
      // transient, and for a room that is gone the reconnect gets a 404 and
      // stops. Reimplementing that here would only fight it.
    };

    return () => {
      alive = false;
      source.close();
    };
  }, [matchId, token]);

  return { match, slot, connected, error, serverNow, apply };
}

/**
 * Milliseconds left until a server timestamp, recomputed on a timer.
 *
 * Separate from the countdown's rendering so the number and the thing that
 * draws it are not the same concern — and so a component that only wants to
 * know whether the keys are unlocked does not have to re-render at 10 Hz to
 * find out.
 */
export function useTimeLeft(
  target: number | null,
  serverNow: () => number,
  tickMs = 100,
): number {
  const [state, setState] = useState(() => ({
    target,
    left: remaining(target, serverNow),
  }));

  // Adjusting state during render is the supported way to reset on a changed
  // input — the same move `useTypingSession` makes. An effect would show the
  // old countdown for one frame, which on a five-second clock is visible.
  if (state.target !== target) {
    setState({ target, left: remaining(target, serverNow) });
  }
  const left =
    state.target === target ? state.left : remaining(target, serverNow);

  useEffect(() => {
    if (target === null) return;
    const id = window.setInterval(
      () => setState({ target, left: remaining(target, serverNow) }),
      tickMs,
    );
    return () => window.clearInterval(id);
  }, [target, serverNow, tickMs]);

  return left;
}

function remaining(target: number | null, serverNow: () => number): number {
  return target === null ? 0 : Math.max(0, target - serverNow());
}
