import { describe, expect, it } from 'vitest';
import { metrics } from './metrics';
import { replay, ReplayError } from './replay';
import { applyInput, createSession } from './session';
import type { Keystroke, Session } from './types';

/** Digita uma string pelo engine de verdade, que é quem produz timeline. */
function run(target: string, input: string, autoIndent = false): Session {
  let session = createSession(target, { autoIndent });
  Array.from(input).forEach((char, i) => {
    session = applyInput(session, char, i * 100);
  });
  return session;
}

describe('replay', () => {
  it('reproduces a clean run exactly', () => {
    const played = run('casa', 'casa');
    const rebuilt = replay('casa', played.keystrokes);

    expect(rebuilt.typed).toEqual(played.typed);
    expect(rebuilt.finishedAt).toBe(played.finishedAt);
    expect(metrics(rebuilt, 1_000)).toEqual(metrics(played, 1_000));
  });

  it('reproduces a run with mistakes', () => {
    const played = run('casa', 'cxsa');
    const rebuilt = replay('casa', played.keystrokes);
    expect(metrics(rebuilt, 1_000).accuracy).toBe(metrics(played, 1_000).accuracy);
    expect(metrics(rebuilt, 1_000).correct).toBe(3);
  });

  it('lets a later keystroke at the same index stand, the way a fix does', () => {
    const timeline: Keystroke[] = [
      { char: 'c', at: 0, index: 0, correct: true },
      { char: 'x', at: 100, index: 1, correct: false },
      // Backspace não entra na timeline; a correção reusa o índice.
      { char: 'a', at: 200, index: 1, correct: true },
      { char: 's', at: 300, index: 2, correct: true },
      { char: 'a', at: 400, index: 3, correct: true },
    ];
    const rebuilt = replay('casa', timeline);
    expect(rebuilt.typed.join('')).toBe('casa');
    // O erro fica registrado mesmo com o caractere corrigido.
    expect(metrics(rebuilt, 1_000).accuracy).toBe(80);
  });

  it('recomputes correctness instead of believing the wire', () => {
    const lie: Keystroke[] = [
      { char: 'z', at: 0, index: 0, correct: true },
      { char: 'z', at: 100, index: 1, correct: true },
    ];
    const rebuilt = replay('oi', lie);
    expect(rebuilt.keystrokes.every((k) => k.correct)).toBe(false);
    expect(metrics(rebuilt, 1_000).accuracy).toBe(0);
  });

  it('re-derives auto-indentation rather than trusting it', () => {
    const target = 'if x {\n  y();\n}';
    const played = run(target, 'if x {\n', true);
    const rebuilt = replay(target, played.keystrokes, { autoIndent: true });
    expect(rebuilt.given).toEqual(played.given);
    expect(rebuilt.typed.join('')).toBe('if x {\n  ');
  });

  it('gives no free indentation when the session did not ask for it', () => {
    const target = 'if x {\n  y();\n}';
    const timeline = run(target, 'if x {\n', true).keystrokes;
    expect(replay(target, timeline).given).toEqual([]);
  });

  it('rejects a keystroke pointing outside the target', () => {
    const forged: Keystroke[] = [{ char: 'a', at: 0, index: 99, correct: true }];
    expect(() => replay('oi', forged)).toThrow(ReplayError);
  });

  it('rejects a timeline that skips positions', () => {
    const forged: Keystroke[] = [
      { char: 'o', at: 0, index: 0, correct: true },
      { char: 'a', at: 100, index: 3, correct: true },
    ];
    expect(() => replay('oi ai', forged)).toThrow(ReplayError);
  });

  it('leaves an incomplete run unfinished, so it cannot be submitted as one', () => {
    const played = run('casa', 'ca');
    expect(replay('casa', played.keystrokes).finishedAt).toBeNull();
  });
});
