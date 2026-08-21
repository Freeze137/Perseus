"use client";

import type { Match } from "@perseus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { describeConfig, inviteLink } from "./duel-copy";
import { LeaveButton } from "./leave-button";

type Props = {
  match: Match;
  slot: number;
  /** Closes the room and goes home. See the page, which owns the seat. */
  onLeave: () => void;
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
export function DuelLobby({ match, slot: yourSlot, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  /**
   * Shown only when the clipboard refused.
   *
   * The first version of this swallowed that refusal, on the theory that the
   * code is on screen anyway. It is — but somebody who pressed "copiar link"
   * wanted the link, and a button that answers nothing reads as broken rather
   * than as declined. So the refusal now produces the link itself, selected,
   * which is the thing the button was for.
   */
  const [manual, setManual] = useState(false);
  const manualField = useRef<HTMLInputElement>(null);
  const host = match.players.find((player) => player.slot === 1);
  const waiting = yourSlot === 1;

  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), COPIED_MS);
    return () => window.clearTimeout(id);
  }, [copied]);

  const copy = useCallback(() => {
    const link = inviteLink(match.inviteCode);

    // `navigator.clipboard` is missing outside a secure context and rejects
    // when the browser or a permission policy says no. Both are ordinary — and
    // neither is something the person pressing the button can act on unless
    // they are handed the link.
    const written = navigator.clipboard?.writeText(link);
    if (!written) {
      setManual(true);
      return;
    }

    void written
      .then(() => {
        setManual(false);
        setCopied(true);
      })
      .catch(() => setManual(true));
  }, [match.inviteCode]);

  // Selected on arrival: with the link already highlighted, copying it by hand
  // is one keystroke instead of a drag across text.
  useEffect(() => {
    if (manual) manualField.current?.select();
  }, [manual]);

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

      {/* Quem está na sala, com o nome que a pessoa escolheu.
          Sem isto o lobby mostra um código e mais nada: o nome recém-digitado
          some da tela até a corrida começar, o que faz parecer que ele não foi
          guardado. O assento vazio é declarado em vez de escondido — é a única
          coisa que falta para a partida sair. */}
      <ul className="flex flex-col">
        {[1, 2].map((slot) => {
          const player = match.players.find((one) => one.slot === slot);
          const you = player?.slot === yourSlot;
          return (
            <li
              key={slot}
              className="flex items-baseline justify-between gap-3 border-b border-slate py-2 text-left last:border-b-0"
            >
              <span
                data-you={you}
                data-empty={!player}
                className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-base text-ash data-[you=true]:text-bone"
              >
                {player?.displayName ?? "Assento livre"}
              </span>
              <span data-you={you} className="label data-[you=true]:text-mint">
                {player ? (you ? "Você" : "Pronto") : "Esperando"}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="flex items-center justify-center gap-3">
        <Button variant="edge" size="sm" onClick={copy}>
          {copied ? "Link copiado" : "Copiar link"}
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-slate" />
        <span className="text-sm text-ash">{describeConfig(match.config)}</span>
      </div>

      {/* O caminho de quando o clipboard nega. Só aparece aí — em uso normal
          esta linha não existe e o botão continua sendo a história inteira. */}
      {manual ? (
        <div className="flex flex-col gap-2 text-left">
          <label htmlFor="duel-link" className="label text-ash">
            Copie o link
          </label>
          <input
            id="duel-link"
            ref={manualField}
            readOnly
            value={inviteLink(match.inviteCode)}
            onFocus={(event) => event.target.select()}
            className="h-9 w-full min-w-0 rounded-sm border border-slate bg-void px-3 text-sm text-bone"
          />
        </div>
      ) : null}

      {/* Said once, here, because it is the one thing about a duel that is not
          obvious: both screens draw the same text without it ever being sent. */}
      <p className="text-xs leading-relaxed text-ash">
        Os dois recebem exatamente o mesmo texto — ele é gerado da mesma semente
        nos dois navegadores, e não trafega pela rede.
      </p>

      {/* Em voz baixa e no fim: fechar uma sala em que ninguém entrou é rotina,
          não decisão dramática. */}
      <div className="flex justify-center">
        <LeaveButton onLeave={onLeave} label="Fechar sala" />
      </div>
    </section>
  );
}
