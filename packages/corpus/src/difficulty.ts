/** Keys your fingers rest on — everything else costs a reach. */
const HOME_ROW = new Set('asdfghjklç;');

/**
 * Rates a text from 1 to 5.
 *
 * Three things make a text hard to type: long words (fewer pauses at spaces),
 * symbols (they need Shift or AltGr), and characters far from the home row.
 */
export function difficultyOf(text: string): 1 | 2 | 3 | 4 | 5 {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return 1;

  const letters = [...text].filter((char) => char !== ' ');
  if (letters.length === 0) return 1;

  const avgWordLength =
    words.reduce((sum, word) => sum + word.length, 0) / words.length;
  const symbolRatio =
    letters.filter((char) => /[^\p{L}\p{N}]/u.test(char)).length / letters.length;
  const reachRatio =
    letters.filter((char) => !HOME_ROW.has(char.toLowerCase())).length /
    letters.length;

  // Weights chosen so a plain everyday sentence lands near 2 and a symbol-heavy
  // technical line lands near 4.
  const score =
    (avgWordLength / 9) * 0.4 + symbolRatio * 3 * 0.3 + reachRatio * 0.3;

  const level = Math.round(1 + score * 4);
  return Math.min(5, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5;
}
