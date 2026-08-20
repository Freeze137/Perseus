"use client";

import type { Language, LeaderboardEntry, SyntaxChoice, TextKind } from "@perseus/contracts";
import { useEffect, useState } from "react";
import { useAuth } from "@/features/auth/use-auth";
import { syntaxLabel } from "@/features/settings/syntax-options";
import { readLeaderboard } from "@/lib/api";

type Props = {
  kind: TextKind;
  language: Language;
  syntax: SyntaxChoice;
};

type Board =
  | { status: "loading" }
  | { status: "off" }
  | { status: "error" }
  | { status: "ready"; entries: LeaderboardEntry[] };

/**
 * The board for whatever the typist is currently set to.
 *
 * It follows the settings rather than offering its own filters: the question
 * somebody opens this panel to ask is "how am I doing at *this*", and a panel
 * that answers about a different mode than the one on screen is a panel that
 * has to be re-configured before it can be read.
 */
export function RankingPanel({ kind, language, syntax }: Props) {
  const { configured, session } = useAuth();
  /**
   * Answers are stored against the question they answer.
   *
   * Switching mode has to show "loading" again, but writing that state from the
   * effect would mean a render, an effect, and a second render on every change.
   * Keying the stored answer instead makes staleness something the render can
   * see for itself: a board whose key no longer matches simply is not an answer
   * to the question on screen.
   */
  const queryKey = `${kind}|${language}|${kind === "code" ? syntax : ""}`;
  const [answer, setAnswer] = useState<{ key: string; board: Board } | null>(null);

  useEffect(() => {
    if (!configured) return;
    let alive = true;

    readLeaderboard({
      kind,
      language,
      syntax: kind === "code" ? syntax : null,
      limit: 20,
    })
      .then((response) => {
        if (!alive) return;
        // The server now says whether it is answering with a board or with an
        // outage. An empty list used to mean both, and "seja o primeiro a
        // ranquear" is a strange thing to tell somebody whose database is down.
        setAnswer({
          key: queryKey,
          board:
            response.status === "ok"
              ? { status: "ready", entries: response.entries }
              : { status: "error" },
        });
      })
      .catch(() => {
        if (alive) setAnswer({ key: queryKey, board: { status: "error" } });
      });

    return () => {
      alive = false;
    };
  }, [configured, queryKey, kind, language, syntax]);

  const board: Board = !configured
    ? { status: "off" }
    : answer?.key === queryKey
      ? answer.board
      : { status: "loading" };

  return (
    <>
      <p className="text-sm leading-relaxed text-ash">
        {kind === "code"
          ? `Código · ${syntaxLabel(syntax)}`
          : `${LABELS[kind]} · ${language === "pt-BR" ? "português" : "inglês"}`}
        {" · precisão mínima de 90%"}
      </p>
      <div className="rule" />

      {board.status === "off" ? (
        <p className="text-sm leading-relaxed text-ash">
          O ranking online ainda não está ligado neste ambiente. O treino
          funciona normalmente sem ele.
        </p>
      ) : null}

      {board.status === "loading" ? (
        <p className="text-sm text-ash">Carregando…</p>
      ) : null}

      {board.status === "error" ? (
        <p className="text-sm leading-relaxed text-rust">
          Não deu para ler o ranking agora. Seus resultados não se perdem por
          isso.
        </p>
      ) : null}

      {board.status === "ready" && board.entries.length === 0 ? (
        <p className="text-sm leading-relaxed text-ash">
          Ninguém pontuou neste modo ainda.{" "}
          {session ? "O primeiro lugar está aberto." : "Entre para disputar."}
        </p>
      ) : null}

      {board.status === "ready" && board.entries.length > 0 ? (
        <ol className="flex flex-col gap-2 text-sm">
          {board.entries.map((entry) => (
            <li
              key={`${entry.rank}-${entry.username}`}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="flex min-w-0 items-baseline gap-2">
                <span className="w-6 shrink-0 text-right font-mono text-xs text-slate">
                  {entry.rank}
                </span>
                <span className="truncate text-bone">{entry.username}</span>
              </span>
              <span className="flex shrink-0 items-baseline gap-2">
                <span className="display text-lg tabular-nums text-mint">
                  {Math.round(entry.wpm)}
                </span>
                <span className="font-mono text-xs text-ash">
                  {Math.round(entry.accuracy)}%
                </span>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
    </>
  );
}

const LABELS: Record<TextKind, string> = {
  words: "Palavras",
  quote: "Frase",
  punctuation: "Pontuação",
  numbers: "Números",
  code: "Código",
};
