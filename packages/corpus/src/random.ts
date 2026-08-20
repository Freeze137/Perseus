/**
 * Seeded pseudo-random numbers.
 *
 * The generator has to be deterministic: a test is identified by its seed, so
 * two people opening the same link must get the exact same text, and a replay
 * must reproduce the run it came from.
 */
export type Random = () => number;

/** FNV-1a, to turn an arbitrary seed string into a 32-bit state. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: small, fast, good enough for picking words. */
export function createRandom(seed: string): Random {
  let state = hashSeed(seed);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick<T>(random: Random, items: readonly T[]): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('cannot pick from an empty list');
  return item;
}

/** A seed short enough to sit in a URL. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
