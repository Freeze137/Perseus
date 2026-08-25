"use client";

import type { MatchSummary } from "@perseus/contracts";
import { useEffect, useState, useSyncExternalStore } from "react";
import { readMatchHistory } from "@/lib/api";
import { KIND_LABELS } from "./duel-copy";
import {
  noMatchIds,
  readMatchIds,
  subscribeDuels,
} from "./match-storage";

type State =
  | { status: "loading" }
  | { status: "error" }
  /** O servidor não tem banco atrás dos duelos, então nada foi guardado. */
  | { status: "unstored"; matches: MatchSummary[] }
  | { status: "ready"; matches: MatchSummary[] };

/**
 * Duelos passados, como este browser os lembra.
 *
 * A lista de ids é local e as linhas são do servidor — que é o arranjo honesto
 * quando não existe conta: o duelo pertence aos dois jogadores, e a única coisa
 * que é de fato "sua" é saber que você esteve nele. Limpar este browser perde a
 * lista e não os duelos.
 */
export function MatchHistoryPanel() {
  // Quais duelos são deste browser é estado fora do React; é lido como tal.
  const ids = useSyncExternalStore(subscribeDuels, readMatchIds, noMatchIds);
  const [state, setState] = useState<State>({ status: "loading" });

  useEffect(() => {
    if (ids.length === 0) return;
    let alive = true;
    readMatchHistory(ids)
      .then((response) => {
        if (!alive) return;
        setState(
          response.status === "ok"
            ? { status: "ready", matches: response.matches }
            : { status: "unstored", matches: response.matches },
        );
      })
      .catch(() => {
        if (alive) setState({ status: "error" });
      });

    return () => {
      alive = false;
    };
  }, [ids]);

  // Derivado em vez de guardado: lista vazia é coisa que o render enxerga
  // sozinho, e um estado pra isso seria uma segunda cópia do mesmo fato.
  if (ids.length === 0 || (state.status === "ready" && state.matches.length === 0)) {
    return (
      <p className="text-sm leading-relaxed text-ash">
        Nenhum duelo ainda. O primeiro aparece aqui assim que terminar.
      </p>
    );
  }

  if (state.status === "loading") {
    return <p className="text-sm text-ash">…</p>;
  }

  if (state.status === "error") {
    return (
      <p className="text-sm leading-relaxed text-ash">
        Não foi possível ler o histórico agora.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {state.status === "unstored" ? (
        <p className="text-sm leading-relaxed text-ash">
          Este servidor não está guardando duelos, então só aparecem os que
          acabaram de acontecer.
        </p>
      ) : null}

      <ol className="flex flex-col gap-3">
        {state.matches.map((match) => (
          <li key={match.id} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="truncate text-sm text-bone">
                {match.players
                  .map((player) => player.displayName)
                  .join("  ×  ")}
              </span>
              <span className="font-mono text-xs tabular-nums text-ash">
                {when(match.finishedAt)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-xs text-ash">
                {KIND_LABELS[match.kind]}
                {" · "}
                {match.players
                  .map((player) =>
                    player.score
                      ? `${Math.round(player.score.wpm)} ppm`
                      : "Não completou",
                  )
                  .join("  ×  ")}
              </span>
              <span className="label text-mint">{outcome(match)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function outcome(match: MatchSummary): string {
  if (match.state === "abandoned") return "Sem corrida";
  if (match.winnerSlot === null) return "Empate";
  const winner = match.players.find(
    (player) => player.slot === match.winnerSlot,
  );
  return winner ? `${winner.displayName} venceu` : "Encerrado";
}

/** Curto e local. Duelo desta tarde não precisa de ano. */
function when(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();
  return sameDay
    ? date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
