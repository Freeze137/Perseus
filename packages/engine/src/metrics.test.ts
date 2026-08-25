import { describe, expect, it } from 'vitest';
import { keyStats, metrics } from './metrics';
import { applyBackspace, applyInput, createSession } from './session';
import type { Session } from './types';

/** Monta uma sessão terminada com intervalo fixo entre todas as teclas. */
function run(target: string, input: string, gapMs: number): Session {
  let session = createSession(target);
  Array.from(input).forEach((char, i) => {
    session = applyInput(session, char, i * gapMs);
  });
  return session;
}

describe('metrics', () => {
  it('is all zeros before the first character', () => {
    const result = metrics(createSession('casa'), 1_000);
    expect(result).toMatchObject({ elapsedMs: 0, wpm: 0, rawWpm: 0, accuracy: 0 });
  });

  it('computes wpm from correct characters over elapsed time', () => {
    // 11 caracteres de 100ms: 1000ms de corrida, 11/5 palavras em 1/60 min.
    const result = metrics(run('hello world', 'hello world', 100));
    expect(result.elapsedMs).toBe(1_000);
    expect(result.wpm).toBeCloseTo(132, 5);
    expect(result.accuracy).toBe(100);
  });

  it('keeps raw wpm above wpm when characters are wrong', () => {
    const result = metrics(run('hello world', 'hxllo world', 100));
    expect(result.correct).toBe(10);
    expect(result.incorrect).toBe(1);
    expect(result.rawWpm).toBeGreaterThan(result.wpm);
    expect(result.accuracy).toBeCloseTo((10 / 11) * 100, 5);
  });

  it('still counts a corrected mistake against accuracy', () => {
    let session = createSession('casa');
    session = applyInput(session, 'c', 0);
    session = applyInput(session, 'x', 100);
    session = applyBackspace(session, 200);
    session = applyInput(session, 'a', 300);
    session = applyInput(session, 's', 400);
    session = applyInput(session, 'a', 500);

    const result = metrics(session);
    expect(result.correct).toBe(4);
    expect(result.incorrect).toBe(0);
    expect(result.accuracy).toBeCloseTo((4 / 5) * 100, 5);
  });

  it('scores a perfectly even rhythm as maximum consistency', () => {
    expect(metrics(run('casa', 'casa', 100)).consistency).toBeCloseTo(100, 5);
  });

  it('scores an erratic rhythm lower than an even one', () => {
    let erratic = createSession('casa');
    [0, 50, 700, 750].forEach((at, i) => {
      erratic = applyInput(erratic, 'casa'[i] as string, at);
    });

    expect(metrics(erratic).consistency).toBeLessThan(
      metrics(run('casa', 'casa', 100)).consistency,
    );
  });

  it('does not let one interruption erase an otherwise steady rhythm', () => {
    // Quarenta caracteres parelhos, trinta segundos de interrupção no meio,
    // mais quarenta igualmente parelhos. A pausa custa cada ponto de PPM que
    // vale, mas não pode ainda chamar a digitação de errática — que era o que
    // o número antigo por intervalo fazia.
    let session = createSession('x'.repeat(80));
    Array.from({ length: 80 }).forEach((_, i) => {
      const at = i * 120 + (i >= 40 ? 30_000 : 0);
      session = applyInput(session, 'x', at);
    });

    expect(metrics(session).consistency).toBeGreaterThan(80);
  });

  it('measures the clock against now while the session is still running', () => {
    const session = applyInput(createSession('casa'), 'c', 1_000);
    expect(metrics(session, 3_000).elapsedMs).toBe(2_000);
  });
});

describe('keyStats', () => {
  it('attributes errors to the expected key, worst first', () => {
    const stats = keyStats(run('aaab', 'xxab', 100));
    const a = stats.find((entry) => entry.key === 'a');

    expect(stats[0]?.key).toBe('a');
    expect(a).toMatchObject({ typed: 3, errors: 2 });
    expect(a?.avgLatencyMs).toBe(100);
  });
});
