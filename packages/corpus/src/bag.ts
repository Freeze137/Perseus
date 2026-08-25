import type { Phrase } from './data/types';
import { createRandom } from './random';

/**
 * Onde a pessoa está dentro da sacola de sorteio.
 *
 * A razão deste tipo existir é ele viajar *dentro do seed*. O texto de uma
 * corrida tem que ser função pura da config, porque o servidor regera esse
 * texto só a partir da config pra pontuar — ver `ResultsService.score`. Uma
 * sacola guardada no `localStorage` e consultada na hora do sorteio faria o texto do
 * cliente depender de estado que o servidor não enxerga, e todo envio seria
 * recusado como timeline inválida.
 *
 * Então o browser lembra a *posição*, não o resultado. A posição entra no seed,
 * o seed vai pro servidor junto com a corrida, e o servidor distribui a mesma
 * sacola a partir do mesmo id e chega nas mesmas frases.
 */
export type BagPosition = {
  /** Identifica o embaralhamento. Fixo enquanto a pessoa mantém a sacola. */
  readonly id: string;
  /** Quantas frases já saíram dele. */
  readonly cursor: number;
};

/** Como a posição é escrita no seed: id, ponto, cursor. */
const SEED = /^(.+)\.(\d+)$/;

/**
 * Lê a posição de dentro de um seed.
 *
 * Seed sem cursor é a posição zero de uma sacola com o nome do seed inteiro. É o
 * que deixa o duelo funcionar sem mexer em nada: o servidor escolhe um seed
 * simples pra sala e nunca avança, e os dois clientes tiram do topo da sacola.
 */
export function positionOf(seed: string): BagPosition {
  const match = SEED.exec(seed);
  if (!match) return { id: seed, cursor: 0 };
  const [, id = seed, cursor = '0'] = match;
  return { id, cursor: Number.parseInt(cursor, 10) };
}

/** Escreve a posição de volta no seed. */
export function seedFor(position: BagPosition): string {
  return `${position.id}.${position.cursor}`;
}

/** A posição depois de uma corrida que tirou `drawn` frases. */
export function advance(position: BagPosition, drawn: number): BagPosition {
  return { id: position.id, cursor: position.cursor + Math.max(0, drawn) };
}

/**
 * Uma passada da sacola: todo índice do pool, embaralhado.
 *
 * Memoizado por (base, epoch) porque uma corrida pede três ou quatro frases e
 * senão reembaralharia o pool inteiro pra cada uma.
 */
const ORDERS = new Map<string, readonly number[]>();

function orderFor(size: number, base: string, epoch: number): readonly number[] {
  const key = `${base}:${epoch}:${size}`;
  const cached = ORDERS.get(key);
  if (cached) return cached;

  const order = shuffle(size, `${base}:${epoch}`);

  // A regra que faz a virada parecer virada: a frase que fechou a passada
  // anterior não pode abrir a próxima. Sem isso, esvaziar a sacola tem uma chance
  // em `size` de mostrar a mesma frase duas vezes seguidas — que é exatamente o
  // que a sacola existe pra evitar, e aconteceria no momento mais visível, bem na
  // emenda.
  if (epoch > 0) {
    const previous = shuffle(size, `${base}:${epoch - 1}`);
    if (order[0] === previous[previous.length - 1] && size > 1) {
      [order[0], order[1]] = [order[1] as number, order[0] as number];
    }
  }

  ORDERS.set(key, order);
  return order;
}

/** Fisher-Yates nos índices, tocado pelo gerador semeado. */
function shuffle(size: number, seed: string): number[] {
  const random = createRandom(seed);
  const order = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j] as number, order[i] as number];
  }
  return order;
}

/**
 * A frase numa posição absoluta do fluxo infinito de sacolas.
 *
 * Posição além do fim de uma passada rola pra próxima, reembaralhada. Corrida
 * que começa perto do fim da sacola termina na passada seguinte em vez de ser
 * cortada, e ninguém vê corrida acabar cedo só porque a sacola estava quase
 * vazia.
 */
export function phraseAt(
  pool: readonly Phrase[],
  base: string,
  position: number,
): Phrase {
  const size = pool.length;
  const epoch = Math.floor(position / size);
  const offset = position % size;
  const order = orderFor(size, base, epoch);
  return pool[order[offset] as number] as Phrase;
}
