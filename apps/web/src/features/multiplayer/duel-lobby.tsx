"use client";

import type { Match } from "@perseus/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { TEXT_LENGTHS } from "@/features/settings/text-lengths";
import { reseedMatch } from "@/lib/api";
import { describeConfig, inviteLink } from "./duel-copy";
import { LeaveButton } from "./leave-button";

type Props = {
  match: Match;
  slot: number;
  /** A cadeira desta aba. A de quem criou é o que deixa sortear outro texto. */
  token: string;
  /** Fecha a sala e vai pra casa. Ver a página, que é dona da cadeira. */
  onLeave: () => void;
};

/** Quanto tempo "copiado" fica no botão antes de voltar a oferecer. */
const COPIED_MS = 1_600;

/**
 * A sala de espera, que é uma instrução e uma string.
 *
 * O código é o produto aqui, então é composto na fonte de display num tamanho
 * que sobrevive à foto de uma tela — que é como um convite de fato viaja entre
 * duas pessoas sentadas em salas diferentes. O link é oferecido ao lado dele e
 * não no lugar dele: link é mais rápido quando há uma janela de conversa
 * aberta, e inútil quando não há.
 *
 * Não existe botão de "começar". Os dois clientes já têm o texto, então a única
 * coisa que falta combinar é quando — e a regressiva que começa no instante em
 * que o segundo jogador chega diz isso sem ninguém precisar apertar nada.
 */
export function DuelLobby({ match, slot: yourSlot, token, onLeave }: Props) {
  const [copied, setCopied] = useState(false);
  /**
   * Mostrado só quando a área de transferência recusou.
   *
   * A primeira versão disto engolia a recusa, com a teoria de que o código está
   * na tela de qualquer jeito. E está — mas quem apertou "copiar link" queria o
   * link, e botão que não responde nada lê como quebrado e não como recusado.
   * Então a recusa agora produz o próprio link, já selecionado, que é a coisa
   * pra qual o botão existia.
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

    // `navigator.clipboard` não existe fora de contexto seguro e rejeita quando
    // o browser ou uma política de permissão diz não. Os dois são comuns — e
    // nenhum é coisa sobre a qual quem apertou o botão possa agir, a não ser que
    // o link seja entregue.
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

  // Selecionado ao chegar: com o link já destacado, copiar na mão é uma tecla
  // em vez de arrastar por cima do texto.
  useEffect(() => {
    if (manual) manualField.current?.select();
  }, [manual]);

  /**
   * Sorteia outro texto, e opcionalmente outro tamanho.
   *
   * Nada é aplicado localmente. O servidor publica a sala pras duas abas, então
   * o texto novo chega do mesmo jeito que toda outra mudança chega — que é
   * também o que impede a tela do convidado de ficar um texto atrás da de quem
   * criou.
   */
  const [drawing, setDrawing] = useState(false);
  const newText = useCallback(
    (length?: number) => {
      setDrawing(true);
      void reseedMatch(match.id, token, length)
        .catch(() => undefined)
        .finally(() => setDrawing(false));
    },
    [match.id, token],
  );

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

      {/* Só o anfitrião, e só aqui: a partir da contagem o texto é o que as
          duas pessoas estão digitando, e trocá-lo seria apagar a corrida de
          alguém. O servidor recusa das duas formas; isto é a metade visível. */}
      {waiting ? (
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Select
            label="Tamanho do texto"
            value={String(match.config.length)}
            options={TEXT_LENGTHS}
            onValueChange={(value) => newText(Number(value))}
          />
          <span aria-hidden="true" className="h-4 w-px bg-slate" />
          <Button
            variant="quiet"
            size="sm"
            disabled={drawing}
            onClick={() => newText()}
          >
            Novo texto
          </Button>
        </div>
      ) : null}

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
