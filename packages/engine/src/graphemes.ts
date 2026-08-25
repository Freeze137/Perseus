const segmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Quebra o texto no que a pessoa enxerga como caractere. NFC antes, senão o
 * "á" pronto e o "´" + "a" da tecla morta não batem.
 */
export function toGraphemes(text: string): string[] {
  const normalized = text.normalize('NFC');
  if (!segmenter) return Array.from(normalized);
  return Array.from(segmenter.segment(normalized), (s) => s.segment);
}

export function normalizeChar(char: string): string {
  return char.normalize('NFC');
}
