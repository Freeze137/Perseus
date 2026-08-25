"use client";

import { MATCH_HISTORY_MAX } from "@perseus/contracts";

/**
 * O registro que o próprio browser tem de quais duelos são dele.
 *
 * Duelo não tem conta atrás — dois amigos escolhem nome e correm — então não há
 * onde pendurar "seus duelos" no servidor. A cadeira é o que deixa uma aba
 * recarregada voltar pra sala em que já estava, e a lista de ids é sobre o que o
 * painel de histórico pergunta ao servidor.
 *
 * Os dois são conveniências, e os dois falham macio. Limpar o browser perde a
 * lista e não os duelos: as linhas continuam lá, e quem tiver um link ainda lê
 * um de volta.
 *
 * ---
 *
 * É escrito como store assinável em vez de um par de funções que alguém chama
 * num efeito. Armazenamento local é estado que vive fora do React, e o jeito
 * suportado de ler estado de fora é o `useSyncExternalStore` — que precisa de
 * três coisas que este arquivo fornece: um subscribe, um retrato que mantém a
 * identidade enquanto nada muda, e um retrato de servidor pro render que
 * acontece onde não existe armazenamento nenhum.
 */
const SEATS_KEY = "perseus:duel-seats";
const HISTORY_KEY = "perseus:duels";

/** Em quantas salas um browser pode estar em duelo. Duas já é generoso; dez é bobagem. */
const SEATS_MAX = 10;

export type Seat = {
  matchId: string;
  slot: number;
  /** Prova de ser um dos dois jogadores. Sem sentido depois que a sala morre. */
  token: string;
  /** Epoch ms, pra despejar a mais velha em vez de uma qualquer. */
  at: number;
};

/** Cadeiras por código de convite: o código é o que a URL carrega. */
type Seats = Record<string, Seat>;

const listeners = new Set<() => void>();

/**
 * Valores já lidos, guardados contra a string crua de onde vieram.
 *
 * `useSyncExternalStore` compara retratos por identidade e re-renderiza pra
 * sempre se um objeto novo voltar toda vez que ele olha. Cachear contra o texto
 * cru é o que faz "nada mudou" ser observável em vez de apenas verdadeiro.
 */
let seatsRaw: string | null = null;
let seatsValue: Seats = {};
let idsRaw: string | null = null;
let idsValue: readonly string[] = [];

/** The empty answer for a render that happens where storage does not exist. */
const NO_IDS: readonly string[] = [];

export function subscribeDuels(listener: () => void): () => void {
  listeners.add(listener);
  // Outra aba terminando um duelo é uma mudança no mesmo armazenamento; este é
  // o evento que avisa.
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

export function seatFor(code: string): Seat | null {
  return readSeats()[code] ?? null;
}

/** The server has no storage, so it has no seat. */
export function noSeat(): Seat | null {
  return null;
}

export function rememberSeat(code: string, seat: Omit<Seat, "at">): void {
  const seats = { ...readSeats(), [code]: { ...seat, at: Date.now() } };
  const kept = Object.entries(seats)
    .sort((a, b) => b[1].at - a[1].at)
    .slice(0, SEATS_MAX);
  write(SEATS_KEY, Object.fromEntries(kept));
}

export function forgetSeat(code: string): void {
  const seats = readSeats();
  if (!(code in seats)) return;
  const next = { ...seats };
  delete next[code];
  write(SEATS_KEY, next);
}

/** Adds a duel to the history list, newest first, oldest evicted. */
export function rememberMatch(id: string): void {
  const ids = readMatchIds();
  if (ids[0] === id) return;
  write(
    HISTORY_KEY,
    [id, ...ids.filter((other) => other !== id)].slice(0, MATCH_HISTORY_MAX),
  );
}

export function readMatchIds(): readonly string[] {
  const raw = raw_(HISTORY_KEY);
  if (raw !== idsRaw) {
    idsRaw = raw;
    const parsed = parse<unknown>(raw);
    idsValue = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  }
  return idsValue;
}

export function noMatchIds(): readonly string[] {
  return NO_IDS;
}

function readSeats(): Seats {
  const raw = raw_(SEATS_KEY);
  if (raw !== seatsRaw) {
    seatsRaw = raw;
    const parsed = parse<unknown>(raw);
    seatsValue =
      typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
        ? (parsed as Seats)
        : {};
  }
  return seatsValue;
}

function raw_(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function parse<T>(raw: string | null): T | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    // Armazenamento corrompido custa a lista, não a página.
    return null;
  }
}

function write(key: string, value: unknown): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Modo privado, ou cota cheia. Nenhum dos dois é motivo pra falhar um duelo.
  }
  for (const listener of listeners) listener();
}
