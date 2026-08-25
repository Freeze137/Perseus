import { describe, expect, it } from 'vitest';
import {
  applyBackspace,
  applyInput,
  createSession,
  cursor,
  isFinished,
  isMistake,
  resetSession,
  status,
} from './session';
import { metrics } from './metrics';
import type { Session } from './types';

/** Digita a string inteira, um caractere por vez, de 100ms. */
function type(target: string, input: string, stopOnError = false) {
  let session = createSession(target, { stopOnError });
  Array.from(input).forEach((char, i) => {
    session = applyInput(session, char, i * 100);
  });
  return session;
}

describe('session', () => {
  it('starts idle and only starts the clock on the first character', () => {
    const fresh = createSession('oi');
    expect(status(fresh)).toBe('idle');
    expect(fresh.startedAt).toBeNull();

    const started = applyInput(fresh, 'o', 500);
    expect(status(started)).toBe('running');
    expect(started.startedAt).toBe(500);
  });

  it('finishes when the last character lands', () => {
    const session = type('oi', 'oi');
    expect(isFinished(session)).toBe(true);
    expect(session.finishedAt).toBe(100);
  });

  it('marks a mistake and keeps going', () => {
    const session = type('casa', 'cxsa');
    expect(isMistake(session, 1)).toBe(true);
    expect(isMistake(session, 2)).toBe(false);
    expect(cursor(session)).toBe(4);
    expect(isFinished(session)).toBe(true);
  });

  it('blocks further input after a mistake when stopOnError is set', () => {
    const session = type('casa', 'cxsa', true);
    expect(cursor(session)).toBe(2);
    expect(isFinished(session)).toBe(false);
  });

  it('lets backspace undo a mistake without erasing it from the timeline', () => {
    let session = type('casa', 'cx');
    session = applyBackspace(session, 300);
    session = applyInput(session, 'a', 400);

    expect(session.typed.join('')).toBe('ca');
    expect(isMistake(session, 1)).toBe(false);
    // Três caracteres foram confirmados, mesmo que só dois sobrem.
    expect(session.keystrokes).toHaveLength(3);
  });

  it('ignores input past the end of the target', () => {
    let session = type('oi', 'oi');
    session = applyInput(session, 'x', 999);
    expect(session.typed.join('')).toBe('oi');
  });

  it('treats a dead-key accent as one character', () => {
    let session = createSession('não');
    expect(session.target).toEqual(['n', 'ã', 'o']);

    session = applyInput(session, 'n', 0);
    // "a" + til combinante, o formato que a tecla morta dá antes de compor.
    session = applyInput(session, 'a\u0303', 100);
    session = applyInput(session, 'o', 200);

    expect(isFinished(session)).toBe(true);
    expect(session.keystrokes).toHaveLength(3);
    expect(session.keystrokes.every((k) => k.correct)).toBe(true);
  });

  it('splits multi-character input, so a paste is graded character by character', () => {
    const session = applyInput(createSession('casa'), 'casa', 0);
    expect(isFinished(session)).toBe(true);
    expect(session.keystrokes).toHaveLength(4);
  });

  it('resets to the same target', () => {
    const session = resetSession(type('casa', 'casa'));
    expect(status(session)).toBe('idle');
    expect(session.target.join('')).toBe('casa');
    expect(session.keystrokes).toHaveLength(0);
  });
});

describe('auto-indentation', () => {
  /** Duas linhas, com dois espaços de indentação na segunda. */
  const CODE = 'if x {\n  y();\n}';

  function type(session: Session, text: string, at = 1): Session {
    return applyInput(session, text, at);
  }

  it('is off unless the session asks for it', () => {
    let session = createSession(CODE);
    session = type(session, 'if x {\n');
    expect(session.typed.join('')).toBe('if x {\n');
    expect(session.given).toEqual([]);
  });

  it('supplies the indentation that follows a correct newline', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, 'if x {\n');
    expect(session.typed.join('')).toBe('if x {\n  ');
    // Os dois espaços estão na tela mas marcados como não sendo da pessoa.
    expect(session.given).toEqual([7, 8]);
  });

  it('never counts supplied whitespace as a keystroke', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, 'if x {\n');
    expect(session.keystrokes).toHaveLength(7);
    expect(session.keystrokes.map((k) => k.char).join('')).toBe('if x {\n');
  });

  it('leaves indentation alone after a wrong newline', () => {
    // O alvo quer "i"; Enter aqui é erro, e erro não pode ser premiado com
    // mais três caracteres de progresso de graça.
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, '\n');
    expect(session.given).toEqual([]);
    expect(session.typed).toEqual(['\n']);
  });

  it('takes the supplied run off with one backspace', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, 'if x {\n');
    session = applyBackspace(session, 2);
    // A quebra de linha e a indentação que ela trouxe saem juntas.
    expect(session.typed.join('')).toBe('if x {');
    expect(session.given).toEqual([]);
  });

  it('still deletes one character at a time inside a line', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, 'if');
    session = applyBackspace(session, 2);
    expect(session.typed.join('')).toBe('i');
  });

  it('clears the supplied positions on reset', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = type(session, 'if x {\n');
    expect(resetSession(session).given).toEqual([]);
  });

  it('does not pay the typist for whitespace it supplied', () => {
    let indented = createSession(CODE, { autoIndent: true });
    indented = applyInput(indented, 'if x {\n', 0);
    indented = applyInput(indented, 'y', 60_000);

    // Sete caracteres apertados mais o "y" estão certos; os dois espaços não
    // contam, mesmo estando no `typed` e batendo com o alvo.
    expect(metrics(indented, 60_000).correct).toBe(8);
    expect(indented.typed.filter((_, i) => indented.given.includes(i))).toEqual([
      ' ',
      ' ',
    ]);
  });

  it('does not book supplied whitespace as mistakes either', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = applyInput(session, 'if x {\n', 0);
    session = applyInput(session, 'y', 60_000);

    // Corrida limpa é corrida limpa: os dois espaços grátis não são creditados
    // nem culpados, então erro fica em zero e precisão em 100.
    const stats = metrics(session, 60_000);
    expect(stats.incorrect).toBe(0);
    expect(stats.accuracy).toBe(100);
  });

  it('reports cpm as correct characters, undivided', () => {
    let session = createSession(CODE, { autoIndent: true });
    session = applyInput(session, 'if x {\n', 0);
    session = applyInput(session, 'y', 60_000);
    const stats = metrics(session, 60_000);
    // Exatamente um minuto, oito caracteres creditados.
    expect(Math.round(stats.cpm)).toBe(8);
    expect(Math.round(stats.wpm)).toBe(2);
  });
});
