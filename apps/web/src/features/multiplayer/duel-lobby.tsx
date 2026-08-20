"use client";

import type { Match } from "@perseus/contracts";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeConfig, inviteLink } from "./duel-copy";

type Props = {
  match: Match;
  slot: number;
};

/** How long "copiado" stays on the button before it goes back to offering. */
const COPIED_MS = 1_600;

/**
 * The waiting room, which is one instruction and one string.
 *
 * The code is the product here, so it is set in the display face at a size
 * that survives a photograph of a screen — which is how an invite actually
 * travels between two people sitting in different rooms. The link is offered
 * next to it rather than instead of it: a link is faster when there is a chat
 * window open, and useless when there is not.
 *
 * There is no "start" button. Both clients already hold the text, so the only
 * thing left to agree on is when — and the countdown that begins the moment the
 * second player arrives says that without anybody having to press anything.
 */
export function DuelLobby({ match, slot }: Props) {
  const [copied, setCopied] = useState(false);
  const host = match.players.find((player) => player.slot === 1);
  const waiting = slot === 1;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = useCallback(() => {
    void navigator.clipboard
      ?.writeText(inviteLink(match.inviteCode))
      .then(() => setCopied(true))
      // A clipboard that refuses is not a failure worth a message: the code is
      // on screen in letters made to be read out loud.
      .catch(() => undefined);
  }, [match.inviteCode]);

  return (
    <section className="mx-auto flex w-full max-w-md flex-col gap-6 text-center">
      <header className="flex flex-col gap-2">
        <h1 className="label">
          {waiting ? "Sala aberta" : "Você entrou"}
        </h1>
        <p className="text-sm leading-relaxed text-ash">
          {waiting
            ? "Mande o código para quem vai duelar. A contagem começa sozinha quando a outra pessoa entrar."
            : `Esperando ${host?.displayName ?? "o anfitrião"} começar.`}
        </p>
      </header>

      <p className="display text-6xl tracking-[0.2em] text-mint">
        {match.inviteCode}
      </p>

      <div className="flex items-center justify-center gap-3">
        <Button variant="edge" size="sm" onClick={copy}>
          {copied ? "Link copiado" : "Copiar link"}
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-slate" />
        <span className="text-sm text-ash">{describeConfig(match.config)}</span>
      </div>

      {/* Said once, here, because it is the one thing about a duel that is not
          obvious: both screens draw the same text without it ever being sent. */}
      <p className="text-xs leading-relaxed text-ash">
        Os dois recebem exatamente o mesmo texto — ele é gerado da mesma semente
        nos dois navegadores, e não trafega pela rede.
      </p>
    </section>
  );
}
