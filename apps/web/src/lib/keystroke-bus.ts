import type { Keystroke } from '@perseus/engine';

/**
 * Canal paralelo entre a área de digitação e a cena 3D.
 *
 * O canvas não pode ficar no caminho crítico da tecla: se o teclado assinasse
 * estado do React, cada tecla re-renderizaria texto e cena juntos, e o
 * caractere apareceria um frame atrasado. Em vez disso a cena escuta aqui e
 * anima por refs dentro do próprio loop de render.
 */
export type KeystrokeListener = (keystroke: Keystroke) => void;

const listeners = new Set<KeystrokeListener>();

export function emitKeystroke(keystroke: Keystroke): void {
  for (const listener of listeners) listener(keystroke);
}

export function onKeystroke(listener: KeystrokeListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
