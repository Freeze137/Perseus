"use client";

import {
  CORPUS_VERSION,
  RUN_TICKET_TTL_MS,
  type RunTicket,
  type SessionConfig,
  type SubmitResult,
} from "@perseus/contracts";
import type { Standing } from "@perseus/contracts";
import type { Session } from "@perseus/engine";
import { isFinished } from "@perseus/engine";
import { useCallback, useEffect, useRef, useState } from "react";
import { useIdentity } from "@/features/identity/use-identity";
import { ApiError, startRun, submitResult } from "@/lib/api";

export type SyncState =
  | "off"
  | "idle"
  | "sending"
  | "sent"
  | "failed"
  /** Guardado pra depois: o problema foi a rede, não a corrida. */
  | "queued"
  /** Esta aba está um deploy atrás e não dá pra verificar até recarregar. */
  | "stale";

/** Onde as corridas esperam quando a rede não está lá pra levá-las. */
const QUEUE_KEY = "perseus:pending-results";
/** Fila é cortesia, não banco. Funda o bastante pra uma tarde ruim. */
const QUEUE_MAX = 10;

/**
 * Manda uma corrida terminada pra ser pontuada, uma vez.
 *
 * O que vai pela rede é a timeline de teclas, não os números da tela. O
 * servidor regera o texto a partir da config e deriva o resultado sozinho,
 * então os números que a pessoa acabou de ler são uma prévia local do que o
 * servidor vai concluir por conta própria — e se os dois discordarem, o
 * servidor está certo, porque é o que ninguém edita.
 *
 * Duas coisas acontecem aqui que já foram uma. Um bilhete é tirado no instante
 * em que o primeiro caractere cai, e é ele que dá à corrida uma identidade
 * emitida pelo servidor e um relógio; o envio seguinte o carrega. E corrida que
 * a rede recusou é guardada em vez de descartada: vai pra uma fila no
 * armazenamento local e é oferecida de novo na próxima visita, porque a
 * alternativa é perder o recorde pessoal de alguém pra uma conexão que caiu.
 */
/**
 * O que o envio produziu: em que pé ele está, e onde a corrida deixou a pessoa.
 *
 * `standing` é null enquanto não voltou, e continua null pra quem não tem
 * identidade — a corrida foi pontuada pelo servidor do mesmo jeito, ela só não
 * classificou ninguém.
 */
export type SyncResult = { state: SyncState; standing: Standing | null };

export function useResultSync(
  session: Session,
  config: SessionConfig,
): SyncResult {
  const { passport } = useIdentity();
  const [state, setState] = useState<SyncState>("idle");
  const [standing, setStanding] = useState<Standing | null>(null);
  const sent = useRef<Session | null>(null);
  /**
   * O bilhete da corrida em andamento, guardado como a promise e não como o
   * valor. Texto curto terminado por gente rápida chega antes do próprio
   * bilhete pela rede, e corrida recusada porque o papel ainda estava em voo
   * seria o jeito mais irritante possível de perder um recorde pessoal.
   */
  const ticket = useRef<{
    startedAt: number;
    pending: Promise<RunTicket | null>;
  } | null>(null);


  /**
   * Tira o bilhete na primeira tecla.
   *
   * Não quando o texto é sorteado: alguém apertando Escape por cinco textos
   * procurando um que goste abriria cinco corridas, e o relógio de cada uma
   * teria começado antes de qualquer digitação.
   */
  useEffect(() => {
    const startedAt = session.startedAt;
    if (startedAt === null) {
      // Um reset limpa: a próxima corrida é outra corrida e não pode ser
      // arquivada sob o bilhete da que foi abandonada.
      ticket.current = null;
      return;
    }
    if (ticket.current?.startedAt === startedAt) return;

    const pending = startRun().catch((error: unknown) => {
      // Nada a mostrar ainda — a corrida ainda está sendo digitada. O envio
      // abaixo é onde a falta de bilhete fica visível.
      console.warn(`could not open the run: ${describe(error)}`);
      return null;
    });
    ticket.current = { startedAt, pending };
  }, [session.startedAt]);

  const deliver = useCallback(
    async (payload: SubmitResult): Promise<SyncState> => {
      try {
        const response = await submitResult(payload, passport);
        setStanding(response.standing);
        return "sent";
      } catch (error: unknown) {
        if (!(error instanceof ApiError)) throw error;
        // Já guardado não é falha: uma retentativa depois de resposta perdida
        // cai aqui, e a corrida pela qual ela pergunta está no ranking.
        if (error.code === "duplicate") return "sent";
        if (error.code === "corpus_version") return "stale";
        if (error.retryable) {
          enqueue(payload);
          return "queued";
        }
        console.warn(`result not stored: ${error.message}`);
        return "failed";
      }
    },
    [passport],
  );

  // O que sobrou de uma visita anterior sobe antes de qualquer coisa nova, pra
  // um recorde pessoal na fila não ser ultrapassado no ranking pela corrida que
  // veio depois dele.
  useEffect(() => {
    let alive = true;

    void (async () => {
      for (const payload of drainQueue()) {
        if (!alive) return;
        const outcome = await deliver(payload);
        // Ainda sem rede: voltou pra fila dentro do `deliver`, e empurrar o
        // resto contra uma conexão que não existe desperdiça os primeiros
        // segundos da aba. Tenta de novo na próxima visita.
        if (outcome === "queued") return;
      }
    })();

    return () => {
      alive = false;
    };
  }, [deliver]);

  /**
   * Guardado pela identidade da sessão e não por um booleano: um re-render, um
   * recomeço no mesmo texto ou um segundo fim não podem arquivar a mesma
   * corrida duas vezes.
   */
  useEffect(() => {
    if (!isFinished(session)) return;
    if (sent.current === session) return;
    sent.current = session;

    const pending = ticket.current?.pending;
    let alive = true;
    setState("sending");
    // Limpa a posição da corrida anterior antes de pedir a nova: uma carta de
    // resultado mostrando o lugar da corrida passada por meio segundo é pior
    // que uma que ainda não mostra lugar nenhum.
    setStanding(null);

    void (async () => {
      const run = pending ? await pending : null;
      if (!alive) return;
      if (!run) {
        // Sem bilhete, sem envio. A corrida fica na tela e fica honesta sobre
        // não ter sido arquivada; inventar um bilhete não está em jogo.
        setState("failed");
        console.warn("no run ticket for this run — it was not sent");
        return;
      }

      const payload: SubmitResult = {
        config,
        corpusVersion: CORPUS_VERSION,
        run,
        // `correct` fica de fora: o servidor recalcula, e mandar só convidaria
        // alguém a tentar setar. `at` é arredondado pra milissegundo inteiro —
        // as casas do performance.now() não mudam pontuação nenhuma e são um
        // sexto do tamanho da requisição de uma corrida longa.
        keystrokes: session.keystrokes.map(({ char, at, index }) => ({
          char,
          at: Math.round(at),
          index,
        })),
      };

      const outcome = await deliver(payload);
      if (alive) setState(outcome);
    })();

    return () => {
      alive = false;
    };
  }, [session, config, deliver]);

  return { state, standing };
}

/** Põe uma corrida de lado pra próxima visita, a mais nova por último, a mais velha despejada. */
function enqueue(payload: SubmitResult): void {
  const queue = readQueue().filter((item) => item.run.id !== payload.run.id);
  queue.push(payload);
  write(queue.slice(-QUEUE_MAX));
}

/**
 * Pega tudo que vale retentar e esvazia o armazenamento.
 *
 * Bilhete que passou da janela do servidor é descartado aqui em vez de enviado:
 * seria recusado, e recusa sobre a qual a pessoa não pode fazer nada não vale
 * uma requisição.
 */
function drainQueue(): SubmitResult[] {
  const now = Date.now();
  const queue = readQueue().filter(
    (item) => now - item.run.issuedAt < RUN_TICKET_TTL_MS,
  );
  write([]);
  return queue;
}

function readQueue(): SubmitResult[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    // Formato checado de leve de propósito: o servidor valida direito, e
    // entrada corrompida tem que custar uma corrida em vez de lançar em todo
    // carregamento.
    return Array.isArray(parsed) ? (parsed as SubmitResult[]) : [];
  } catch {
    return [];
  }
}

function write(queue: SubmitResult[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {
    // Armazenamento local cheio ou desligado não é motivo pra perder a corrida
    // que está na tela. A fila é melhor esforço por definição.
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
