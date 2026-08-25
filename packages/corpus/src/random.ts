/**
 * Números pseudo-aleatórios com semente.
 *
 * Tem que ser determinístico: um teste é identificado pelo seed, então duas
 * pessoas abrindo o mesmo link recebem exatamente o mesmo texto, e um replay
 * reproduz a corrida de onde veio.
 */
export type Random = () => number;

/** FNV-1a, pra virar uma string de seed qualquer em estado de 32 bits. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32: pequeno, rápido, suficiente pra escolher palavra. */
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

/** Seed curto o bastante pra caber numa URL. */
export function randomSeed(): string {
  return Math.random().toString(36).slice(2, 10);
}
