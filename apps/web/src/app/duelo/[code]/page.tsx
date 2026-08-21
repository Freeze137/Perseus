"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useCallback, useEffect, useSyncExternalStore } from "react";
import { DuelJoin } from "@/features/multiplayer/duel-join";
import { DuelLobby } from "@/features/multiplayer/duel-lobby";
import { DuelScreen } from "@/features/multiplayer/duel-screen";
import {
  forgetSeat,
  noSeat,
  rememberMatch,
  rememberSeat,
  seatFor,
  subscribeDuels,
} from "@/features/multiplayer/match-storage";
import { useMatch } from "@/features/multiplayer/use-match";
import { leaveMatch } from "@/lib/api";

/**
 * One duel, at one invite code.
 *
 * The code is the whole address: a link that can be pasted into a chat, opened
 * on a phone, and read out loud. What separates the two players from anybody
 * else holding it is the seat in local storage — the token the server issued
 * when they joined — which is also what lets a reloaded tab walk back into a
 * duel that is already running.
 *
 * A visitor with no seat is offered the invite screen. A visitor whose seat
 * points at a room that no longer exists is offered the same thing, because a
 * dead token is indistinguishable from never having had one, and telling
 * somebody their token expired is not an instruction they can follow.
 */
export default function DuelPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code: raw } = use(params);
  const code = raw.toUpperCase();
  const router = useRouter();

  /**
   * The seat comes straight out of local storage, which is state outside React
   * — so it is read the way outside state is meant to be read. The server
   * snapshot is "no seat": nothing rendered on the server can know, and the
   * invite screen is the correct thing to show while that is true.
   */
  const seat = useSyncExternalStore(
    subscribeDuels,
    () => seatFor(code),
    noSeat,
  );

  const link = useMatch(seat?.matchId ?? null, seat?.token ?? null);
  const { match, error, apply } = link;

  // A duel worth remembering is one that was played to the end. The round is
  // what gets remembered, not the room: a rematch plays another duel in the
  // same room, and both belong in the history as their own entries.
  useEffect(() => {
    if (match?.state === "done") rememberMatch(match.roundId);
  }, [match?.state, match?.roundId]);

  // A seat whose room is gone is worse than no seat: it holds the screen on an
  // error nobody can act on, where dropping it offers the invite form instead.
  useEffect(() => {
    if (!error || !seat) return;
    forgetSeat(code);
  }, [error, seat, code]);

  /**
   * Ends the duel and walks away.
   *
   * The seat is dropped whatever the server answers. A failed request here means
   * the room was already gone or the network is down — in both cases the thing
   * to do is leave, and keeping a dead seat would only send this tab back into a
   * room that no longer exists.
   */
  const leave = useCallback(() => {
    if (!seat) return;
    const { matchId, token } = seat;
    forgetSeat(code);
    router.push("/");
    void leaveMatch(matchId, token).catch(() => undefined);
  }, [seat, code, router]);

  const joined = useCallback(
    (credentials: { match: { id: string }; slot: number; token: string }) => {
      rememberSeat(code, {
        matchId: credentials.match.id,
        slot: credentials.slot,
        token: credentials.token,
      });
    },
    [code],
  );

  return (
    <div className="relative z-10 flex min-h-dvh flex-col">
      <header className="flex h-18 shrink-0 items-center justify-between px-6">
        <Link
          href="/"
          className="text-sm font-medium text-ash transition-colors hover:text-mint"
        >
          ← Treino
        </Link>
        <span className="display text-xl tracking-[0.3em] text-bone">
          PERSEUS
        </span>
        <span className="w-16" aria-hidden="true" />
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col justify-center gap-8 px-6 pb-16">
        {!seat ? (
          <DuelJoin code={code} onJoined={joined} />
        ) : !match ? (
          <p className="text-center text-sm text-ash">Entrando na sala…</p>
        ) : match.state === "lobby" ? (
          <DuelLobby
            match={match}
            slot={seat.slot}
            token={seat.token}
            onLeave={leave}
          />
        ) : (
          <DuelScreen
            match={match}
            slot={seat.slot}
            token={seat.token}
            serverNow={link.serverNow}
            connected={link.connected}
            onMatch={apply}
            onLeave={leave}
          />
        )}
      </main>
    </div>
  );
}
