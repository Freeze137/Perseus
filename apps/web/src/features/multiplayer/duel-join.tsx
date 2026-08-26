"use client";

import type { Match, MatchCredentials } from "@perseus/contracts";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { joinMatch, previewMatch } from "@/lib/api";
import { describeConfig, explainRefusal } from "./duel-copy";

type Props = {
  code: string;
  onJoined: (credentials: MatchCredentials) => void;
};

/**
 * A tela de convite: o que é este duelo, e quem você quer ser nele.
 *
 * O nome é pedido aqui em vez de tirado de uma conta porque duelo não tem conta
 * — e porque o nome é por partida, de propósito. É o que aparece na tela do
 * outro e o que acaba nos dois históricos, então é a primeira e única coisa que
 * esta tela coleta.
 *
 * A sala é mostrada antes de o nome ser pedido. Digitar um nome num formulário
 * pra uma sala que já está cheia, ou já rodando, é um jeito pior de descobrir do
 * que ser avisado antes de começar.
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
        if (alive) setProblem(explainRefusal(error));
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
      // Guardar a cadeira é trabalho da página — é o que tem que sobreviver a
      // um recarregamento, e um escritor por chave é a regra inteira.
      .then(onJoined)
      .catch((error: unknown) => {
        setProblem(explainRefusal(error));
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

