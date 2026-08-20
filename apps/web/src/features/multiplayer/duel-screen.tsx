"use client";

import {
  MATCH_PROGRESS_MS,
  type Match,
} from "@perseus/contracts";
import { generate } from "@perseus/corpus";
import { isFinished, type Session } from "@perseus/engine";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TypingArea } from "@/features/typing/typing-area";
import { useTypingSession } from "@/features/typing/use-typing-session";
import { ApiError, finishMatch, publishProgress } from "@/lib/api";
import { DuelResult } from "./duel-result";
import { DuelTrack } from "./duel-track";
import { useTimeLeft } from "./use-match";

type Props = {
  match: Match;
  slot: number;
  token: string;
  serverNow: () => number;
  /** Whether the event stream is open. Shown, not hidden — see below. */
  connected: boolean;
  /** Hands the settled room up when the submission answers before the stream. */
  onMatch: (match: Match) => void;
};

type Submission = "idle" | "sending" | "sent" | "failed";

/**
 * The duel itself: countdown, text, both carets, result.
 *
 * The text is generated here from the config the server handed both players.
 * It is never transmitted — same seed, same corpus version, same characters, by
 * construction — which is the property the whole feature rests on and the
 * reason a duel costs no more bandwidth than a solo run plus two small numbers
 * a second.
 *
 * Three things are deliberately kept off the keystroke path: the progress
 * publisher runs on its own interval and reads the caret from a ref, the
 * opponent's bar is a transform, and the submission happens once, after the
 * last character. Nothing in this component may make the next letter wait.
 */
export function DuelScreen({
  match,
  slot,
  token,
  serverNow,
  connected,
  onMatch,
}: Props) {
  const isCode = match.config.kind === "code";
  const text = useMemo(() => generate(match.config), [match.config]);
  const { session, input, backspace } = useTypingSession(text, {
    autoIndent: isCode,
  });

  const running = match.state === "running";
  const countdown = useTimeLeft(
    match.state === "countdown" ? match.startsAt : null,
    serverNow,
  );
  const grace = useTimeLeft(
    running ? match.graceEndsAt : null,
    serverNow,
    250,
  );

  const me = match.players.find((player) => player.slot === slot);
  const them = match.players.find((player) => player.slot !== slot);
  const done = match.state === "done" || match.state === "abandoned";

  const [submission, setSubmission] = useState<Submission>("idle");
  const [refusal, setRefusal] = useState<string | null>(null);

  /**
   * Read by the publisher below without being one of its dependencies: the
   * interval must not be torn down and rebuilt on every character. Written in
   * an effect rather than during render, which is the rule for refs.
   */
  const caret = useRef(0);
  useEffect(() => {
    caret.current = session.typed.length;
  }, [session.typed.length]);

  useEffect(() => {
    if (!running) return;
    let last = -1;
    const id = window.setInterval(() => {
      const index = caret.current;
      if (index === last) return;
      last = index;
      // Failures are swallowed on purpose. This is the decorative channel, and
      // a dropped position costs one frame of somebody else's progress bar.
      void publishProgress(match.id, token, index).catch(() => undefined);
    }, MATCH_PROGRESS_MS);
    return () => window.clearInterval(id);
  }, [running, match.id, token]);

  /**
   * Sends the timeline, once, guarded by the session's identity rather than a
   * boolean — the same rule the solo sync uses, for the same reason: a
   * re-render must not file the same run twice.
   */
  const sent = useRef<Session | null>(null);
  useEffect(() => {
    if (!isFinished(session)) return;
    if (sent.current === session) return;
    sent.current = session;
    setSubmission("sending");

    finishMatch(
      match.id,
      token,
      session.keystrokes.map(({ char, at, index }) => ({
        char,
        at: Math.round(at),
        index,
      })),
    )
      .then((settled) => {
        setSubmission("sent");
        onMatch(settled);
      })
      .catch((error: unknown) => {
        setSubmission("failed");
        setRefusal(
          error instanceof ApiError
            ? error.message
            : "não foi possível enviar a corrida",
        );
      });
  }, [session, match.id, token, onMatch]);

  const swallow = useCallback(() => undefined, []);

  if (done) return <DuelResult match={match} slot={slot} />;

  return (
    <div className="flex flex-col gap-6">
      <DuelTrack
        total={session.target.length}
        lanes={[
          {
            name: me?.displayName ?? "você",
            // The local caret rather than the number last published: it is the
            // same value a beat earlier, and this lane is about your own text.
            index: session.typed.length,
            finished: isFinished(session),
            mine: true,
          },
          {
            name: them?.displayName ?? "aguardando",
            index: them?.progress ?? 0,
            finished: Boolean(them?.finishedAt),
            mine: false,
          },
        ]}
      />

      {match.state === "countdown" ? (
        <p
          aria-live="assertive"
          className="flex items-baseline justify-center gap-3"
        >
          <span className="display text-6xl tabular-nums text-mint">
            {Math.ceil(countdown / 1000)}
          </span>
          <span className="label">o texto libera em</span>
        </p>
      ) : null}

      <TypingArea
        session={session}
        layout={isCode ? "code" : "prose"}
        // The keys are the server's to unlock. Before that the input is real,
        // focused and inert — which is a different thing from being absent, and
        // the difference is that nothing jumps when the countdown ends.
        onInput={running ? input : swallow}
        onBackspace={running ? backspace : swallow}
        // A duel has no restart and no escape: the run you are in is the run.
        onRestart={swallow}
        onCancel={swallow}
        swapping={false}
        // Changes exactly once, when the keys unlock. Focusing the hidden input
        // during the countdown would swallow the keystrokes of somebody warming
        // their hands up on it.
        focusSignal={running ? 1 : 0}
      />

      <p aria-live="polite" className="text-center text-sm text-ash">
        {status({
          running,
          finishedMine: isFinished(session),
          finishedTheirs: Boolean(them?.finishedAt),
          grace,
          submission,
          refusal,
          connected,
          them: them?.displayName ?? "o outro jogador",
        })}
      </p>
    </div>
  );
}

/**
 * One line, saying the truest thing available.
 *
 * Order matters: a refusal outranks the clock, the clock outranks the network,
 * and "connecting" is only worth saying when nothing more interesting is
 * happening. A stream that dropped is stated rather than hidden — the duel
 * continues, the other player's bar is simply frozen, and somebody watching a
 * bar that has stopped deserves to know which of the two it means.
 */
function status(state: {
  running: boolean;
  finishedMine: boolean;
  finishedTheirs: boolean;
  grace: number;
  submission: Submission;
  refusal: string | null;
  connected: boolean;
  them: string;
}): string {
  if (state.refusal) return `A corrida não foi aceita: ${state.refusal}`;
  if (state.submission === "sending") return "Enviando sua corrida…";

  if (state.finishedMine && !state.finishedTheirs) {
    return state.grace > 0
      ? `Esperando ${state.them} — ${Math.ceil(state.grace / 1000)}s`
      : `Esperando ${state.them}`;
  }
  if (state.finishedTheirs && !state.finishedMine) {
    return state.grace > 0
      ? `${state.them} terminou. Você tem ${Math.ceil(state.grace / 1000)}s`
      : `${state.them} terminou`;
  }
  if (!state.connected) return "Sem conexão com a sala — reconectando";
  if (!state.running) return "Prepare as mãos";
  return "";
}
