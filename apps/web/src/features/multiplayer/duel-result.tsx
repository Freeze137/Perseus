"use client";

import type { Match, MatchOutcome } from "@perseus/contracts";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { requestRematch } from "@/lib/api";
import { explainRefusal } from "./duel-copy";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";

/**
 * O placar chegando.
 *
 * Um momento autoral, e é este: o duelo acabou e os números que o servidor
 * calculou estão sendo entregues. Tudo assenta vindo de um pouco atrás e fora
 * de foco — o mesmo material que a regressiva usa, pro fim de um duelo ser
 * visivelmente o mesmo objeto que o começo dele.
 *
 * A ordem carrega sentido. O veredito cai primeiro, a régua se desenha embaixo,
 * depois os dois jogadores na ordem dos lugares, depois a saída. Ninguém precisa
 * ouvir onde olhar.
 */
const SETTLE = { duration: 0.44, ease: [0.16, 1, 0.3, 1] } as const;

/** Quanto cada linha espera atrás da de cima. */
const STEP_MS = 0.09;

/** A velocidade em que os contadores correm. Longa o bastante pra ler como contagem. */
const COUNT = { duration: 0.85, ease: [0.16, 1, 0.3, 1] } as const;

type Props = {
  match: Match;
  /** Qual jogador está lendo isto. Null quando nenhum — link de espectador. */
  slot: number | null;
  /** A cadeira desta aba, quando ela tem uma. Espectador não tem e não recebe
   *  oferta de revanche. */
  token: string | null;
  /** Entrega um retrato pra cima quando uma requisição responde antes do stream. */
  onMatch: (match: Match) => void;
};

/**
 * O placar, com os números do servidor nele.
 *
 * Não são os números que os browsers desenharam durante a corrida. As duas
 * timelines foram reproduzidas contra o texto que a semente regera e pontuadas
 * no servidor, então o que é comparado aqui foi calculado pelo único
 * participante que não tem motivo pra preferir nenhum dos dois.
 *
 * A linha de quem perdeu diz o que aconteceu e para. Do outro lado de um duelo
 * está o amigo de alguém, e um produto que não bajula quem ganhou não tem por
 * que alfinetar quem perdeu.
 */
export function DuelResult({ match, slot, token, onMatch }: Props) {
  const router = useRouter();
  const level = useMotionLevel();
  const still = level === "none";
  const abandoned = match.state === "abandoned";

  const me = match.players.find((player) => player.slot === slot);
  const them = match.players.find((player) => player.slot !== slot);

  /**
   * Outra rodada, nesta mesma sala.
   *
   * Oferecida só onde ela pode de fato acontecer: duelo jogado até o fim, por
   * alguém que tem cadeira, com o outro jogador ainda na sala. Sala abandonada
   * falha nas três — não há ninguém do outro lado pra concordar, e é por isso
   * que ela acabou.
   */
  const [asking, setAsking] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const canAsk =
    match.state === "done" &&
    slot !== null &&
    token !== null &&
    match.players.length === 2;
  const iAsked = Boolean(me?.rematch);
  const theyAsked = Boolean(them?.rematch);

  const askRematch = useCallback(() => {
    if (!token) return;
    setAsking(true);
    setRefusal(null);
    // A resposta é um retrato da sala, e é usada em vez de descartada. O stream
    // traz a mesma coisa um instante depois, mas esta tela é a que apertou o
    // botão: ela não devia depender de uma conexão aberta desde antes de o duelo
    // acabar pra mostrar que o aperto chegou.
    requestRematch(match.id, token)
      .then(onMatch)
      .catch((error: unknown) => {
        setRefusal(explainRefusal(error));
      })
      .finally(() => setAsking(false));
  }, [match.id, token, onMatch]);

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
        {canAsk ? (
          <>
            <Button
              variant="edge"
              size="sm"
              disabled={asking || iAsked}
              onClick={askRematch}
            >
              {theyAsked ? "Aceitar revanche" : "Revanche"}
            </Button>
            <span aria-hidden="true" className="h-4 w-px bg-slate" />
          </>
        ) : null}

        <Button variant="quiet" size="sm" onClick={() => router.push("/")}>
          Voltar ao treino
        </Button>
        <span aria-hidden="true" className="h-4 w-px bg-slate" />

        {/* Uma frase por vez, e sempre a que diz de quem é a vez de agir.
            "Esperando" tem destinatário: sem o nome, quem lê fica sem saber se
            precisa fazer algo ou se já fez. */}
        <p aria-live="polite" className="text-sm text-ash">
          {refusal
            ? `A revanche não saiu. ${refusal}`
            : iAsked
              ? `Esperando ${them?.displayName ?? "o outro jogador"} aceitar.`
              : theyAsked
                ? `${them?.displayName ?? "O outro jogador"} quer revanche.`
                : "Este duelo fica no seu histórico de partidas."}
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
 * Um número contando até o que o servidor disse que ele era.
 *
 * Um motion value em vez de estado do React: isto muda sessenta vezes por
 * segundo por menos de um segundo, e re-renderizar o placar inteiro a cada frame
 * pra mover dois dígitos seria pagar a animação com a própria coisa de que a
 * animação trata. `tabular-nums` no pai impede a largura de tremer conforme os
 * dígitos mudam.
 *
 * No nível parado é simplesmente o número. Quem pediu nenhum movimento pediu o
 * resultado, não um jeito mais devagar de recebê-lo.
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
