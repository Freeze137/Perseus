import type { Phrase } from './data/types';
import { createRandom } from './random';

/**
 * Where a typist is inside their shuffle bag.
 *
 * The whole point of this type is that it travels *inside the seed*. A run's
 * text has to stay a pure function of its config, because the server regenerates
 * that text from the config alone in order to score the run — see
 * `ResultsService.score`. A bag kept in `localStorage` and consulted at draw
 * time would make the client's text depend on state the server cannot see, and
 * every submission would be rejected as an invalid timeline.
 *
 * So the browser remembers the *position*, not the result. The position goes
 * into the seed, the seed goes to the server with the run, and the server deals
 * the same bag from the same id and arrives at the same sentences.
 */
export type BagPosition = {
  /** Identifies the shuffle. Fixed for as long as a typist keeps their bag. */
  readonly id: string;
  /** How many sentences have already been dealt out of it. */
  readonly cursor: number;
};

/** How a position is written into a seed: the id, a dot, the cursor. */
const SEED = /^(.+)\.(\d+)$/;

/**
 * Reads a position out of a seed.
 *
 * A seed with no cursor is position zero of a bag named by the whole seed. That
 * is what keeps duels working untouched: the server picks a plain seed for a
 * room and never advances it, and both clients deal the top of that bag.
 */
export function positionOf(seed: string): BagPosition {
  const match = SEED.exec(seed);
  if (!match) return { id: seed, cursor: 0 };
  const [, id = seed, cursor = '0'] = match;
  return { id, cursor: Number.parseInt(cursor, 10) };
}

/** Writes a position back into a seed. */
export function seedFor(position: BagPosition): string {
  return `${position.id}.${position.cursor}`;
}

/** The position after a run that dealt `drawn` sentences. */
export function advance(position: BagPosition, drawn: number): BagPosition {
  return { id: position.id, cursor: position.cursor + Math.max(0, drawn) };
}

/**
 * One pass of a bag: every index of the pool, in a shuffled order.
 *
 * Memoized per (base, epoch) because a single run asks for three or four
 * sentences and would otherwise reshuffle the whole pool for each of them.
 */
const ORDERS = new Map<string, readonly number[]>();

function orderFor(size: number, base: string, epoch: number): readonly number[] {
  const key = `${base}:${epoch}:${size}`;
  const cached = ORDERS.get(key);
  if (cached) return cached;

  const order = shuffle(size, `${base}:${epoch}`);

  // The rule that makes a wrap feel like a wrap: the sentence that ended the
  // last pass must not open the next one. Without this, emptying a bag has a
  // one-in-`size` chance of showing the same sentence twice in a row, which is
  // the exact thing the bag exists to prevent — and it would happen at the most
  // visible moment, across the seam.
  if (epoch > 0) {
    const previous = shuffle(size, `${base}:${epoch - 1}`);
    if (order[0] === previous[previous.length - 1] && size > 1) {
      [order[0], order[1]] = [order[1] as number, order[0] as number];
    }
  }

  ORDERS.set(key, order);
  return order;
}

/** Fisher-Yates over the indices, driven by the seeded generator. */
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
 * The sentence at an absolute position in the endless stream of bags.
 *
 * Positions past the end of one pass roll into the next, reshuffled. A run that
 * starts near the end of a bag therefore finishes in the following one instead
 * of being cut short, and the typist never sees a run end early because their
 * bag happened to be nearly empty.
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
