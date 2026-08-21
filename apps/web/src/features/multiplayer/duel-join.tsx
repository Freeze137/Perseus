"use client";

import type { Match, MatchCredentials } from "@perseus/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { ApiError, joinMatch, previewMatch } from "@/lib/api";
import { describeConfig } from "./duel-copy";

type Props = {
  code: string;
  onJoined: (credentials: MatchCredentials) => void;
};

/**
 * The invite screen: what this duel is, and who you want to be in it.
 *
 * The name is asked for here rather than taken from an account because a duel
 * has no account — and because the name is per match on purpose. It is what
 * shows on the other person's screen and what ends up in both histories, so it
 * is the first and only thing this screen collects.
 *
 * The room is previewed before the name is asked. Typing a name into a form for
 * a room that is already full, or already running, is a worse way to find out
 * than being told before you start.
 */
export function DuelJoin({ code, onJoined }: Props) {
  const [room, setRoom] = useState<Match | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    let alive = true;
    previewMatch(code)
      .then((match) => {
        if (alive) setRoom(match);
      })
      .catch((error: unknown) => {
        if (alive) setProblem(explain(error));
      });
    return () => {
      alive = false;
    };
  }, [code]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const chosen = name.trim();
    if (!chosen || joining) return;

    setJoining(true);
    setProblem(null);
    joinMatch(code, { displayName: chosen })
      // Storing the seat is the page's job — it is the thing that has to
      // survive a reload, and one writer per key is the whole rule.
      .then(onJoined)
      .catch((error: unknown) => {
        setProblem(explain(error));
        setJoining(false);
      });
  };

  if (problem && !room) {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col gap-3 text-center">
        <h1 className="label">Convite</h1>
        <p className="text-sm leading-relaxed text-rust">{problem}</p>
      </section>
    );
  }

  const host = room?.players.find((player) => player.slot === 1);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6">
      <header className="flex flex-col gap-2 text-center">
        <h1 className="label">Duelo</h1>
        <p className="display text-3xl text-bone">
          {host ? `${host.displayName} está esperando` : "Carregando a sala…"}
        </p>
        {room ? (
          <p className="text-sm text-ash">{describeConfig(room.config)}</p>
        ) : null}
      </header>

      <form onSubmit={submit} className="flex flex-col gap-2">
        <label htmlFor="duel-name" className="label">
          Seu nome nesta partida
        </label>
        <div className="flex gap-2">
          <input
            id="duel-name"
            name="displayName"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={20}
            autoComplete="off"
            autoFocus
            placeholder="Como quer aparecer"
            disabled={!room || joining}
            className="h-9 min-w-0 flex-1 rounded-sm border border-slate bg-void px-3 text-sm text-bone placeholder:text-slate"
          />
          <Button
            type="submit"
            variant="edge"
            size="sm"
            disabled={!room || joining || name.trim().length === 0}
          >
            {joining ? "Entrando…" : "Entrar"}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-ash">
          Vale só para este duelo. Fica registrado no histórico das duas
          pessoas, ao lado de quem venceu.
        </p>
      </form>

      {problem ? (
        <p className="text-sm leading-relaxed text-rust">{problem}</p>
      ) : null}
    </section>
  );
}

/**
 * The refusal, in the words of the person it happened to.
 *
 * The server's codes are for branching, not for reading — "match_full" is a
 * fact about a room, and what somebody standing outside it needs is what to do
 * about that.
 */
function explain(error: unknown): string {
  if (!(error instanceof ApiError)) {
    return "Não foi possível falar com o servidor de duelos.";
  }
  switch (error.code) {
    case "match_full":
      return "Esta sala já tem dois jogadores.";
    case "match_closed":
      return "Este duelo já começou.";
    case "match_not_found":
      return "Código não encontrado. Salas expiram depois de alguns minutos sem ninguém.";
    default:
      return error.message;
  }
}
