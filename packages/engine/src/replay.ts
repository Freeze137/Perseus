import { createSession } from './session';
import type { Keystroke, Session, SessionOptions } from './types';

/**
 * Remonta uma sessão terminada a partir da timeline de teclas.
 *
 * Existe pro ranking querer dizer alguma coisa. Número calculado no browser é
 * número que qualquer um digita no console, então o servidor não aceita: ele
 * regera o alvo a partir da config da própria corrida, reproduz a timeline
 * aqui e pontua sozinho. A velocidade que o cliente alega nunca entra no banco.
 *
 * Reproduz por índice, não appendando, porque a timeline não é uma sequência
 * de appends. Backspace não é gravado de propósito — correção não pode inflar
 * a velocidade bruta — então quem corrige deixa duas teclas apontando pra
 * mesma posição, e vale a última.
 *
 * A auto-indentação é recalculada, não confiada: sai do alvo e de onde caíram
 * as quebras de linha. Assim nenhum envio reivindica caractere de graça.
 */
export function replay(
  target: string,
  keystrokes: readonly Keystroke[],
  options: Partial<SessionOptions> = {},
): Session {
  const base = createSession(target, options);
  const typed: string[] = [];
  // Set em vez de array com busca linear: código fundo indenta as mesmas
  // posições a cada quebra, e a busca fazia isso virar quadrático no tamanho
  // da corrida.
  const given = new Set<number>();
  let previousAt: number | null = null;

  for (const keystroke of keystrokes) {
    const { index, char, at } = keystroke;
    if (!Number.isInteger(index) || index < 0 || index >= base.target.length) {
      throw new ReplayError(`keystroke points outside the target: ${index}`);
    }
    // Toda posição até esta já tem que existir. Timeline que pula à frente
    // está reivindicando caractere que ninguém digitou.
    if (index > typed.length) {
      throw new ReplayError(`keystroke at ${index} skips past ${typed.length}`);
    }
    // Tempo anda pra um lado só. Timestamp fora de ordem não é corrida lenta
    // nem rápida: é timeline escrita, não gravada. E as métricas lá na frente
    // leem a primeira e a última entrada como duração.
    if (!Number.isFinite(at)) {
      throw new ReplayError('keystroke has no usable timestamp');
    }
    if (previousAt !== null && at < previousAt) {
      throw new ReplayError(`keystroke at ${index} goes back in time`);
    }
    previousAt = at;

    typed[index] = char;
    if (typed.length < index + 1) typed.length = index + 1;

    if (base.options.autoIndent && char === '\n' && char === base.target[index]) {
      for (let i = index + 1; i < base.target.length; i += 1) {
        const next = base.target[i];
        if (next !== ' ' && next !== '\t') break;
        typed[i] = next;
        given.add(i);
      }
    }
  }

  const startedAt = keystrokes[0]?.at ?? null;
  const last = keystrokes[keystrokes.length - 1];
  const complete = typed.length === base.target.length && !typed.includes(undefined as never);

  return {
    ...base,
    typed,
    given: [...given].filter((index) => index < typed.length),
    // Acerto é recalculado contra o alvo. Nunca vem pronto do envio.
    keystrokes: keystrokes.map((keystroke) => ({
      ...keystroke,
      correct: keystroke.char === base.target[keystroke.index],
    })),
    startedAt,
    finishedAt: complete && last ? last.at : null,
  };
}

export class ReplayError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ReplayError';
  }
}
