import type { KeyboardLayout } from '@perseus/contracts';

/**
 * What a keyboard can put on screen, as far as the corpus is concerned.
 *
 * Layouts are collapsed into this rather than filtered one by one on purpose:
 * ABNT2 and US-International arrange their keys quite differently and reach
 * exactly the same characters, so a text drawn for one must be the text drawn
 * for the other. Splitting the pools per layout name would instead have given
 * them two different texts for the same seed, and made every layout added later
 * a fresh corpus version even when it could type nothing new.
 *
 * 'full'  — every character in the banks, accents included.
 * 'ascii' — printable ASCII, plus the newline and tab that code is made of.
 *           No dead keys, so no "á", no "ç", no "ã".
 */
export type Reach = 'full' | 'ascii';

const REACH: Record<KeyboardLayout, Reach> = {
  abnt2: 'full',
  'us-intl': 'full',
  us: 'ascii',
};

/**
 * Printable ASCII and the two whitespace characters a snippet contains.
 *
 * Written as a range rather than a list of the characters it excludes: the
 * question is what a plain US keyboard *can* produce, and that is a contiguous
 * block. Anything outside it needs a dead key or a compose sequence.
 */
const ASCII = /^[\x20-\x7E\n\t]*$/;

export function reachOf(layout: KeyboardLayout): Reach {
  return REACH[layout];
}

/** Whether every character of `text` can be typed at this reach. */
export function reaches(reach: Reach, text: string): boolean {
  return reach === 'full' || ASCII.test(text);
}
