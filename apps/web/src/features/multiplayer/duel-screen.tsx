"use client";

import {
  MATCH_PROGRESS_MS,
  type Match,
} from "@perseus/contracts";
import { generate } from "@perseus/corpus";
import { isFinished, type Session } from "@perseus/engine";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import { TypingArea } from "@/features/typing/typing-area";
import { useTypingSession } from "@/features/typing/use-typing-session";
import { ApiError, finishMatch, publishProgress } from "@/lib/api";
import { DuelResult } from "./duel-result";
import { DuelTrack } from "./duel-track";
import { LeaveButton } from "./leave-button";
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
  /** Closes the room and goes home. See the page, which owns the seat. */
  onLeave: () => void;
};

type Submission = "idle" | "sending" | "sent" | "failed";

/**
 * How long the start word stays on screen after the keys unlock.
 *
 * Under a second, and gone before anybody has typed a word. A start signal that
 * outlives the start is a start signal in the way.
 */
const GO_MS = 900;

/** How long the zero survives the word that swallows it. */
const ZERO_MS = 340;

/**
 * A number arriving. Exponential ease-out: fast off the mark, settling into
 * place with no bounce — the count is a clock, and a clock that overshoots is
 * telling a joke nobody asked for.
 */
const ARRIVE = { duration: 0.42, ease: [0.16, 1, 0.3, 1] } as const;

/** The start word crossing. Slower than the digits, and it only happens once. */
const CROSS = { duration: 0.62, ease: [0.16, 1, 0.3, 1] } as const;

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
  onLeave,
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

  /**
   * The window the start word lives in, counted off the same server clock as
   * everything else.
   *
   * Deliberately derived from `startsAt` rather than from a local timer started
   * when the state flipped. The whole point of the countdown is that the two
   * screens are counting the same instant; a second clock in here would let one
   * of them drift, and the drift would show up as somebody starting late.
   */
  const level = useMotionLevel();
  const still = level === "none";
  const go = useTimeLeft(
    match.startsAt !== null ? match.startsAt + GO_MS : null,
    serverNow,
    80,
  );
  const showGo = running && go > 0;
  /**
   * The zero the old version skipped: `Math.ceil` goes 5, 4, 3, 2, 1 and then
   * the state flips, so the number the whole count was heading for never
   * appeared. It shows now, for a third of a second, and the start word arrives
   * on top of it — the last thing the count does is get swallowed.
   */
  const showDigit = match.state === "countdown" || (showGo && go > GO_MS - ZERO_MS);
  const digit =
    match.state === "countdown" ? Math.max(0, Math.ceil(countdown / 1000)) : 0;

  const me = match.players.find((player) => player.slot === slot);
  const them = match.players.find((player) => player.slot !== slot);
  const done = match.state === "done" || match.state === "abandoned";

  const [submission, setSubmission] = useState<Submission>("idle");
  const [refusal, setRefusal] = useState<string | null>(null);

  // A rematch is a new duel in the same component: nothing is remounted, so the
  // last round's status line would still be on screen while this one is being
  // typed. The round is what changes between them, and it is what resets this.
  const [round, setRound] = useState(match.roundId);
  if (round !== match.roundId) {
    setRound(match.roundId);
    setSubmission("idle");
    setRefusal(null);
  }

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

  if (done)
    return (
      <DuelResult
        match={match}
        slot={slot}
        token={token}
        onMatch={onMatch}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <DuelTrack
        total={session.target.length}
        lanes={[
          {
            name: me?.displayName ?? "Você",
            // The local caret rather than the number last published: it is the
            // same value a beat earlier, and this lane is about your own text.
            index: session.typed.length,
            finished: isFinished(session),
            mine: true,
          },
          {
            name: them?.displayName ?? "Aguardando",
            index: them?.progress ?? 0,
            finished: Boolean(them?.finishedAt),
            mine: false,
          },
        ]}
      />

      {/* A largada.
   *
   * A altura é reservada o duelo inteiro, e fica vazia depois. Um bloco que
   * some no instante em que as teclas liberam empurraria o texto para cima
   * exatamente no frame em que a pessoa começa a digitar — e nada pode se
   * mexer debaixo de quem está digitando.
   */}
      <div className="relative flex h-20 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {showDigit ? (
            <motion.span
              key={digit}
              aria-hidden="true"
              // O número que chega vem de trás e maior, e engole o anterior,
              // que colapsa para dentro e sai de foco. É a mesma ideia do
              // resto do produto: a contagem não é enfeite, é a única coisa
              // que as duas telas estão fazendo juntas neste segundo.
              initial={
                still
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 1.5, filter: "blur(10px)" }
              }
              animate={
                still
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, filter: "blur(0px)" }
              }
              exit={
                still
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.5, filter: "blur(7px)" }
              }
              transition={transitionFor(level, ARRIVE)}
              className="absolute display text-7xl tabular-nums text-mint"
            >
              {digit}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showGo ? (
            <motion.span
              key="go"
              aria-hidden="true"
              // Atravessa o topo e sai sozinha. Fica acima do texto e nunca
              // sobre ele: a palavra é a largada, não um obstáculo a ler.
              initial={still ? { opacity: 0 } : { opacity: 0, x: "-28%" }}
              animate={still ? { opacity: 1 } : { opacity: 1, x: "0%" }}
              exit={still ? { opacity: 0 } : { opacity: 0, x: "28%" }}
              transition={transitionFor(level, CROSS)}
              className="absolute display text-5xl tracking-[0.35em] text-mint"
            >
              JÁ
            </motion.span>
          ) : null}
        </AnimatePresence>

        {match.state === "countdown" ? (
          <span className="absolute bottom-0 label">o texto libera em</span>
        ) : null}
      </div>

      {/* Duas frases no duelo inteiro, em vez de soletrar cinco números.
          Um leitor de tela lendo "cinco, quatro, três" por cima de si mesmo
          chega atrasado ao que importa, que é o momento de começar. */}
      <p aria-live="assertive" className="sr-only">
        {running ? "Valendo. Pode digitar." : "A corrida começa em instantes."}
      </p>

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

      {/* Depois do texto, nunca antes: durante a corrida o que importa está
          acima, e uma saída oferecida no topo é uma saída oferecida a quem
          ainda está tentando entrar no ritmo. */}
      <div className="flex justify-center">
        <LeaveButton onLeave={onLeave} />
      </div>

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
