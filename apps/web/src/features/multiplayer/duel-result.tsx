"use client";

import type { Match, MatchOutcome } from "@perseus/contracts";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";

/**
 * The scoreboard arriving.
 *
 * One authored moment, and it is this one: the duel is over and the numbers the
 * server computed are being handed down. Everything settles from slightly
 * behind and out of focus — the same material the countdown uses, so the end of
 * a duel is visibly the same object as its beginning.
 *
 * Order carries meaning. The verdict lands first, the rule draws itself under
 * it, then the two players in slot order, then the way out. Nobody has to be
 * told where to look.
 */
const SETTLE = { duration: 0.44, ease: [0.16, 1, 0.3, 1] } as const;

/** How long each row waits behind the one above it. */
const STEP_MS = 0.09;

/** The speed the counters run at. Long enough to read as counting. */
const COUNT = { duration: 0.85, ease: [0.16, 1, 0.3, 1] } as const;

type Props = {
  match: Match;
  /** Which player is reading this. Null when neither — a spectator's link. */
  slot: number | null;
};

/**
 * The scoreboard, with the server's numbers on it.
 *
 * These are not the figures either browser drew during the race. Both timelines
 * were replayed against the text the seed regenerates and scored on the server,
 * so what is compared here was computed by the one participant that has no
 * reason to prefer either player.
 *
 * The losing line says what happened and stops. A duel is somebody's friend on
 * the other end, and a product that does not flatter the winner has no business
 * needling the loser either.
 */
export function DuelResult({ match, slot }: Props) {
  const router = useRouter();
  const level = useMotionLevel();
  const still = level === "none";
  const abandoned = match.state === "abandoned";

  return (
    <section className="flex flex-col gap-5">
      <motion.header
        className="flex flex-col gap-1"
        initial={
          still ? { opacity: 0 } : { opacity: 0, y: 10, filter: "blur(6px)" }
        }
        animate={
          still ? { opacity: 1 } : { opacity: 1, y: 0, filter: "blur(0px)" }
        }
        transition={transitionFor(level, SETTLE)}
      >
        <h2 className="label">{abandoned ? "Duelo encerrado" : "Resultado"}</h2>
        <p className="display text-4xl text-bone">{headline(match, slot)}</p>
        {/* Quem foi deixado na sala precisa saber que acabou e por quê. Sem
            isso, "ninguém terminou" lê como se a culpa fosse dele. */}
        {abandoned ? (
          <p className="text-sm leading-relaxed text-ash">
            A sala foi encerrada antes de alguém chegar ao fim do texto. Nada
            foi registrado.
          </p>
        ) : null}
      </motion.header>

      {/* A régua se desenha da esquerda para a direita: ela separa o veredito
          dos números, e vê-la ser traçada é o que diz que os números vêm em
          seguida. */}
      <motion.div
        className="rule origin-left"
        initial={still ? { opacity: 0 } : { scaleX: 0 }}
        animate={still ? { opacity: 1 } : { scaleX: 1 }}
        transition={transitionFor(level, { ...SETTLE, delay: 0.06 })}
      />

      <ol className="flex flex-col gap-4">
        {match.players.map((player, index) => {
          const won = player.outcome === "won";
          return (
            <motion.li
              key={player.slot}
              className="flex flex-col gap-1.5"
              initial={
                still
                  ? { opacity: 0 }
                  : { opacity: 0, y: 12, filter: "blur(5px)" }
              }
              animate={
                still
                  ? { opacity: 1 }
                  : { opacity: 1, y: 0, filter: "blur(0px)" }
              }
              transition={transitionFor(level, {
                ...SETTLE,
                delay: 0.12 + index * STEP_MS,
              })}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span
                  data-won={won}
                  className="truncate text-base text-ash data-[won=true]:text-bone"
                >
                  {player.displayName}
                  {player.slot === slot ? " · Você" : ""}
                </span>
                <span
                  data-won={won}
                  className="label data-[won=true]:text-mint"
                >
                  {OUTCOME[player.outcome ?? "abandoned"]}
                </span>
              </div>

              {player.score ? (
                <dl className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                  <div className="flex items-baseline gap-2">
                    <dd
                      data-won={won}
                      className="display text-3xl tabular-nums text-ash data-[won=true]:text-mint"
                    >
                      {/* Conta até o número real em vez de aparecer com ele.
                          O que está sendo mostrado é o que o servidor apurou
                          replayando a corrida — vê-lo subir é a única parte
                          desta tela que se parece com o esforço que produziu. */}
                      <Ticker to={Math.round(player.score.wpm)} still={still} />
                    </dd>
                    <dt className="label">ppm</dt>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dd className="font-mono text-sm tabular-nums text-bone">
                      {player.score.accuracy.toFixed(1)}%
                    </dd>
                    <dt className="label">precisão</dt>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <dd className="font-mono text-sm tabular-nums text-bone">
                      {(player.score.durationMs / 1000).toFixed(1)}s
                    </dd>
                    <dt className="label">tempo</dt>
                  </div>
                </dl>
              ) : (
                <p className="text-sm leading-relaxed text-ash">
                  {player.outcome === "unfinished"
                    ? "Não completou o texto dentro dos 30 segundos."
                    : "A corrida não chegou ao fim."}
                </p>
              )}
            </motion.li>
          );
        })}
      </ol>

      <div className="rule" />

      <motion.div
        className="flex flex-wrap items-center gap-3"
        initial={still ? { opacity: 0 } : { opacity: 0, y: 8 }}
        animate={still ? { opacity: 1 } : { opacity: 1, y: 0 }}
        transition={transitionFor(level, { ...SETTLE, delay: 0.34 })}
      >
        <Button variant="edge" size="sm" onClick={() => router.push("/")}>
          Voltar ao treino
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-slate" />
        <p className="text-sm text-ash">
          Este duelo fica no seu histórico de partidas.
        </p>
      </motion.div>
    </section>
  );
}

const OUTCOME: Record<MatchOutcome, string> = {
  won: "Venceu",
  lost: "Perdeu",
  draw: "Empate",
  unfinished: "Não completou a tempo",
  abandoned: "Sem corrida",
};

function headline(match: Match, slot: number | null): string {
  // Um duelo abandonado não tem vencedor e não tem culpado: pode ter sido uma
  // aba fechada, uma conexão perdida ou alguém apertando "encerrar". O servidor
  // não guarda qual das três, e inventar uma seria pior que não dizer.
  if (match.state === "abandoned") return "Duelo encerrado";
  if (match.winnerSlot === null) return "Empate";

  const winner = match.players.find(
    (player) => player.slot === match.winnerSlot,
  );
  if (slot === null) return `${winner?.displayName ?? "Alguém"} venceu`;
  return match.winnerSlot === slot ? "Você venceu" : `${winner?.displayName} venceu`;
}

/**
 * A number counting up to what the server said it was.
 *
 * A motion value rather than React state: this changes sixty times a second for
 * under a second, and re-rendering the whole scoreboard on every frame to move
 * two digits would be paying for the animation with the thing the animation is
 * about. `tabular-nums` on the parent keeps the width from twitching as the
 * digits change.
 *
 * At the still level it is simply the number. Somebody who asked for no motion
 * asked for the result, not for a slower way to receive it.
 */
function Ticker({ to, still }: { to: number; still: boolean }) {
  const value = useMotionValue(still ? to : 0);
  const shown = useTransform(value, (current) => Math.round(current));

  useEffect(() => {
    if (still) {
      value.set(to);
      return;
    }
    const controls = animate(value, to, COUNT);
    return () => controls.stop();
  }, [to, still, value]);

  return <motion.span>{shown}</motion.span>;
}
