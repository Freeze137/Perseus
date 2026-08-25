/** Teclas onde os dedos descansam. O resto custa um alcance. */
const HOME_ROW = new Set('asdfghjklç;');

/**
 * Dá nota de 1 a 5 pro texto.
 *
 * Três coisas deixam um texto difícil: palavra longa (menos pausa no espaço),
 * símbolo (pede Shift ou AltGr) e caractere longe da linha de descanso.
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

  // Pesos escolhidos pra frase comum do dia a dia cair perto de 2 e linha
  // técnica cheia de símbolo cair perto de 4.
  const score =
    (avgWordLength / 9) * 0.4 + symbolRatio * 3 * 0.3 + reachRatio * 0.3;

  const level = Math.round(1 + score * 4);
  return Math.min(5, Math.max(1, level)) as 1 | 2 | 3 | 4 | 5;
}
