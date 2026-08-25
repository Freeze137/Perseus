"use client";

import {
  MATCH_PROGRESS_MS,
  type Match,
} from "@perseus/contracts";
import { generate } from "@perseus/corpus";
import { isFinished, type Session } from "@perseus/engine";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { transitionFor } from "@/features/settings/performance-tiers";
import { useMotionLevel } from "@/features/settings/use-motion-level";
import { TypingArea } from "@/features/typing/typing-area";
import { useTypingSession } from "@/features/typing/use-typing-session";
import { ApiError, finishMatch, publishProgress } from "@/lib/api";
import { DuelResult } from "./duel-result";
import { DuelTrack } from "./duel-track";
import { LeaveButton } from "./leave-button";
import { useTimeLeft } from "./use-match";

type Props = {
  match: Match;
  slot: number;
  token: string;
  serverNow: () => number;
  /** Se o stream de eventos está aberto. Mostrado, não escondido — ver abaixo. */
  connected: boolean;
  /** Entrega a sala resolvida pra cima quando o envio responde antes do stream. */
  onMatch: (match: Match) => void;
  /** Fecha a sala e vai pra casa. Ver a página, que é dona da cadeira. */
  onLeave: () => void;
};

type Submission = "idle" | "sending" | "sent" | "failed";

/**
 * Quanto tempo a palavra de largada fica na tela depois de as teclas liberarem.
 *
 * Menos de um segundo, e some antes de alguém digitar uma palavra. Sinal de
 * largada que sobrevive à largada é sinal de largada atrapalhando.
 */
const GO_MS = 900;

/** Quanto tempo o zero sobrevive à palavra que o engole. */
const ZERO_MS = 340;

/**
 * Um número chegando. Ease-out exponencial: rápido na saída, assentando sem
 * quicar — a contagem é um relógio, e relógio que passa do ponto está contando
 * uma piada que ninguém pediu.
 */
const ARRIVE = { duration: 0.42, ease: [0.16, 1, 0.3, 1] } as const;

/** A palavra de largada atravessando. Mais lenta que os dígitos, e só acontece uma vez. */
const CROSS = { duration: 0.62, ease: [0.16, 1, 0.3, 1] } as const;

/**
 * O duelo em si: regressiva, texto, os dois cursores, resultado.
 *
 * O texto é gerado aqui a partir da config que o servidor entregou aos dois
 * jogadores. Nunca trafega — mesma semente, mesma versão de corpus, mesmos
 * caracteres, por construção — que é a propriedade sobre a qual a
 * funcionalidade inteira se apoia e o motivo de um duelo não custar mais banda
 * que uma corrida solo mais dois numerozinhos por segundo.
 *
 * Três coisas ficam de propósito fora do caminho da tecla: o publicador de
 * progresso roda no intervalo dele e lê o cursor de um ref, a barra do
 * adversário é um transform, e o envio acontece uma vez, depois do último
 * caractere. Nada neste componente pode fazer a próxima letra esperar.
 */
export function DuelScreen({
  match,
  slot,
  token,
  serverNow,
  connected,
  onMatch,
  onLeave,
}: Props) {
  const isCode = match.config.kind === "code";
  const text = useMemo(() => generate(match.config), [match.config]);
  const { session, input, backspace } = useTypingSession(text, {
    autoIndent: isCode,
  });

  const running = match.state === "running";
  const countdown = useTimeLeft(
    match.state === "countdown" ? match.startsAt : null,
    serverNow,
  );
  const grace = useTimeLeft(
    running ? match.graceEndsAt : null,
    serverNow,
    250,
  );

  /**
   * A janela em que a palavra de largada vive, contada do mesmo relógio do
   * servidor que todo o resto.
   *
   * Derivada de `startsAt` de propósito, e não de um timer local começado
   * quando o estado virou. O ponto inteiro da regressiva é as duas telas
   * contarem o mesmo instante; um segundo relógio aqui deixaria uma delas
   * derivar, e a deriva apareceria como alguém largando atrasado.
   */
  const level = useMotionLevel();
  const still = level === "none";
  const go = useTimeLeft(
    match.startsAt !== null ? match.startsAt + GO_MS : null,
    serverNow,
    80,
  );
  const showGo = running && go > 0;
  /**
   * O zero que a versão antiga pulava: `Math.ceil` vai 5, 4, 3, 2, 1 e aí o
   * estado vira, então o número pro qual a contagem inteira ia nunca aparecia.
   * Agora aparece, por um terço de segundo, e a palavra de largada chega em
   * cima dele — a última coisa que a contagem faz é ser engolida.
   */
  const showDigit = match.state === "countdown" || (showGo && go > GO_MS - ZERO_MS);
  const digit =
    match.state === "countdown" ? Math.max(0, Math.ceil(countdown / 1000)) : 0;

  const me = match.players.find((player) => player.slot === slot);
  const them = match.players.find((player) => player.slot !== slot);
  const done = match.state === "done" || match.state === "abandoned";

  const [submission, setSubmission] = useState<Submission>("idle");
  const [refusal, setRefusal] = useState<string | null>(null);

  // Revanche é duelo novo no mesmo componente: nada é remontado, então a linha
  // de status da rodada anterior ainda estaria na tela enquanto esta é
  // digitada. A rodada é o que muda entre as duas, e é o que zera isto.
  const [round, setRound] = useState(match.roundId);
  if (round !== match.roundId) {
    setRound(match.roundId);
    setSubmission("idle");
    setRefusal(null);
  }

  /**
   * Lido pelo publicador abaixo sem ser dependência dele: o intervalo não pode
   * ser derrubado e reconstruído a cada caractere. Escrito num efeito e não
   * durante o render, que é a regra pra ref.
   */
  const caret = useRef(0);
  useEffect(() => {
    caret.current = session.typed.length;
  }, [session.typed.length]);

  useEffect(() => {
    if (!running) return;
    let last = -1;
    const id = window.setInterval(() => {
      const index = caret.current;
      if (index === last) return;
      last = index;
      // Falha é engolida de propósito. Este é o canal decorativo, e uma posição
      // perdida custa um frame da barra de progresso do outro.
      void publishProgress(match.id, token, index).catch(() => undefined);
    }, MATCH_PROGRESS_MS);
    return () => window.clearInterval(id);
  }, [running, match.id, token]);

  /**
   * Manda a timeline, uma vez, guardada pela identidade da sessão e não por um
   * booleano — mesma regra do sync solo, pelo mesmo motivo: um re-render não
   * pode arquivar a mesma corrida duas vezes.
   */
  const sent = useRef<Session | null>(null);
  useEffect(() => {
    if (!isFinished(session)) return;
    if (sent.current === session) return;
    sent.current = session;
    setSubmission("sending");

    finishMatch(
      match.id,
      token,
      session.keystrokes.map(({ char, at, index }) => ({
        char,
        at: Math.round(at),
        index,
      })),
    )
      .then((settled) => {
        setSubmission("sent");
        onMatch(settled);
      })
      .catch((error: unknown) => {
        setSubmission("failed");
        setRefusal(
          error instanceof ApiError
            ? error.message
            : "não foi possível enviar a corrida",
        );
      });
  }, [session, match.id, token, onMatch]);

  const swallow = useCallback(() => undefined, []);

  if (done)
    return (
      <DuelResult
        match={match}
        slot={slot}
        token={token}
        onMatch={onMatch}
      />
    );

  return (
    <div className="flex flex-col gap-6">
      <DuelTrack
        total={session.target.length}
        lanes={[
          {
            name: me?.displayName ?? "Você",
            // O cursor local em vez do último número publicado: é o mesmo valor
            // uma batida antes, e esta pista é sobre o seu próprio texto.
            index: session.typed.length,
            finished: isFinished(session),
            mine: true,
          },
          {
            name: them?.displayName ?? "Aguardando",
            index: them?.progress ?? 0,
            finished: Boolean(them?.finishedAt),
            mine: false,
          },
        ]}
      />

      {/* A largada.
   *
   * A altura é reservada o duelo inteiro, e fica vazia depois. Um bloco que
   * some no instante em que as teclas liberam empurraria o texto para cima
   * exatamente no frame em que a pessoa começa a digitar — e nada pode se
   * mexer debaixo de quem está digitando.
   */}
      <div className="relative flex h-20 items-center justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {showDigit ? (
            <motion.span
              key={digit}
              aria-hidden="true"
              // O número que chega vem de trás e maior, e engole o anterior,
              // que colapsa para dentro e sai de foco. É a mesma ideia do
              // resto do produto: a contagem não é enfeite, é a única coisa
              // que as duas telas estão fazendo juntas neste segundo.
              initial={
                still
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 1.5, filter: "blur(10px)" }
              }
              animate={
                still
                  ? { opacity: 1 }
                  : { opacity: 1, scale: 1, filter: "blur(0px)" }
              }
              exit={
                still
                  ? { opacity: 0 }
                  : { opacity: 0, scale: 0.5, filter: "blur(7px)" }
              }
              transition={transitionFor(level, ARRIVE)}
              className="absolute display text-7xl tabular-nums text-mint"
            >
              {digit}
            </motion.span>
          ) : null}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {showGo ? (
            <motion.span
              key="go"
              aria-hidden="true"
              // Atravessa o topo e sai sozinha. Fica acima do texto e nunca
              // sobre ele: a palavra é a largada, não um obstáculo a ler.
              initial={still ? { opacity: 0 } : { opacity: 0, x: "-28%" }}
              animate={still ? { opacity: 1 } : { opacity: 1, x: "0%" }}
              exit={still ? { opacity: 0 } : { opacity: 0, x: "28%" }}
              transition={transitionFor(level, CROSS)}
              className="absolute display text-5xl tracking-[0.35em] text-mint"
            >
              JÁ
            </motion.span>
          ) : null}
        </AnimatePresence>

        {match.state === "countdown" ? (
          <span className="absolute bottom-0 label">o texto libera em</span>
        ) : null}
      </div>

      {/* Duas frases no duelo inteiro, em vez de soletrar cinco números.
          Um leitor de tela lendo "cinco, quatro, três" por cima de si mesmo
          chega atrasado ao que importa, que é o momento de começar. */}
      <p aria-live="assertive" className="sr-only">
        {running ? "Valendo. Pode digitar." : "A corrida começa em instantes."}
      </p>

      <TypingArea
        session={session}
        layout={isCode ? "code" : "prose"}
        // Quem destrava as teclas é o servidor. Antes disso o input é real,
        // focado e inerte — que é coisa diferente de estar ausente, e a
        // diferença é que nada pula quando a regressiva acaba.
        onInput={running ? input : swallow}
        onBackspace={running ? backspace : swallow}
        // Duelo não tem recomeçar nem escapar: a corrida em que você está é a corrida.
        onRestart={swallow}
        onCancel={swallow}
        swapping={false}
        // Muda exatamente uma vez, quando as teclas destravam. Focar o input
        // escondido durante a regressiva engoliria as teclas de quem está
        // esquentando a mão nela.
        focusSignal={running ? 1 : 0}
      />

      {/* Depois do texto, nunca antes: durante a corrida o que importa está
          acima, e uma saída oferecida no topo é uma saída oferecida a quem
          ainda está tentando entrar no ritmo. */}
      <div className="flex justify-center">
        <LeaveButton onLeave={onLeave} />
      </div>

      <p aria-live="polite" className="text-center text-sm text-ash">
        {status({
          running,
          finishedMine: isFinished(session),
          finishedTheirs: Boolean(them?.finishedAt),
          grace,
          submission,
          refusal,
          connected,
          them: them?.displayName ?? "o outro jogador",
        })}
      </p>
    </div>
  );
}

/**
 * Uma linha, dizendo a coisa mais verdadeira disponível.
 *
 * A ordem importa: recusa vale mais que o relógio, o relógio vale mais que a
 * rede, e "conectando" só vale ser dito quando nada mais interessante está
 * acontecendo. Stream que caiu é dito, não escondido — o duelo continua, a
 * barra do outro simplesmente congela, e quem está olhando uma barra parada
 * merece saber qual das duas coisas ela quer dizer.
 */
function status(state: {
  running: boolean;
  finishedMine: boolean;
  finishedTheirs: boolean;
  grace: number;
  submission: Submission;
  refusal: string | null;
  connected: boolean;
  them: string;
}): string {
  if (state.refusal) return `A corrida não foi aceita: ${state.refusal}`;
  if (state.submission === "sending") return "Enviando sua corrida…";

  if (state.finishedMine && !state.finishedTheirs) {
    return state.grace > 0
      ? `Esperando ${state.them} — ${Math.ceil(state.grace / 1000)}s`
      : `Esperando ${state.them}`;
  }
  if (state.finishedTheirs && !state.finishedMine) {
    return state.grace > 0
      ? `${state.them} terminou. Você tem ${Math.ceil(state.grace / 1000)}s`
      : `${state.them} terminou`;
  }
  if (!state.connected) return "Sem conexão com a sala — reconectando";
  if (!state.running) return "Prepare as mãos";
  return "";
}
