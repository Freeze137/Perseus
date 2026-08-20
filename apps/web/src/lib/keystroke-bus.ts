import type { Keystroke } from '@perseus/engine';

/**
 * Side channel between the typing area and the 3D scene.
 *
 * The canvas must never sit on the keystroke's critical path: if the keyboard
 * subscribed through React state, every keypress would re-render the text and
 * the scene together, and the character would land a frame late. Instead the
 * scene listens here and animates through refs inside its own render loop.
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
