const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Splits text into user-perceived characters, normalizing to NFC first so that
 * a composed "á" and a dead-key "´" + "a" compare equal.
 */
export function toGraphemes(text: string): string[] {
  const normalized = text.normalize('NFC');
  if (!segmenter) return Array.from(normalized);
  return Array.from(segmenter.segment(normalized), (s) => s.segment);
}

export function normalizeChar(char: string): string {
  return char.normalize('NFC');
}
