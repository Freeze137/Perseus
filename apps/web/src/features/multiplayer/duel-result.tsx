"use client";

import type { Match, MatchOutcome } from "@perseus/contracts";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

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
  const abandoned = match.state === "abandoned";

  return (
    <section className="flex flex-col gap-5">
      <header className="flex flex-col gap-1">
        <h2 className="label">{abandoned ? "Duelo encerrado" : "Resultado"}</h2>
        <p className="display text-4xl text-bone">{headline(match, slot)}</p>
      </header>

      <div className="rule" />

      <ol className="flex flex-col gap-4">
        {match.players.map((player) => {
          const won = player.outcome === "won";
          return (
            <li key={player.slot} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span
                  data-won={won}
                  className="truncate text-base text-ash data-[won=true]:text-bone"
                >
                  {player.displayName}
                  {player.slot === slot ? " · você" : ""}
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
                      {Math.round(player.score.wpm)}
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
                    : "Não chegou a correr."}
                </p>
              )}
            </li>
          );
        })}
      </ol>

      <div className="rule" />

      <div className="flex flex-wrap items-center gap-3">
        <Button variant="edge" size="sm" onClick={() => router.push("/")}>
          Voltar ao treino
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-slate" />
        <p className="text-sm text-ash">
          Este duelo fica no seu histórico de partidas.
        </p>
      </div>
    </section>
  );
}

const OUTCOME: Record<MatchOutcome, string> = {
  won: "venceu",
  lost: "perdeu",
  draw: "empate",
  unfinished: "não completou a tempo",
  abandoned: "sem corrida",
};

function headline(match: Match, slot: number | null): string {
  if (match.state === "abandoned") return "Ninguém terminou";
  if (match.winnerSlot === null) return "Empate";

  const winner = match.players.find(
    (player) => player.slot === match.winnerSlot,
  );
  if (slot === null) return `${winner?.displayName ?? "Alguém"} venceu`;
  return match.winnerSlot === slot ? "Você venceu" : `${winner?.displayName} venceu`;
}
