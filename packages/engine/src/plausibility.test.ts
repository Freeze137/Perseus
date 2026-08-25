import { describe, expect, it } from 'vitest';
import { checkTimeline, type TimelineLimits } from './plausibility';
import type { Keystroke } from './types';

const LIMITS: TimelineLimits = {
  maxCpm: 1_500,
  minMedianGapMs: 22,
  minGapVariation: 0.06,
  variationSampleFloor: 30,
};

/**
 * Timeline de `count` teclas, `gapMs` entre elas, com `jitterMs` de tremida
 * pra parecer mão e não loop.
 */
function timeline(count: number, gapMs: number, jitterMs = 0): Keystroke[] {
  let at = 0;
  return Array.from({ length: count }, (_, i) => {
    // Tremida determinística: teste que falha às vezes é pior que teste nenhum.
    at += gapMs + (jitterMs === 0 ? 0 : ((i * 37) % 11) - 5) * (jitterMs / 5);
    return { char: 'a', at: Math.round(at), index: i, correct: true };
  });
}

describe('checkTimeline', () => {
  it('accepts an ordinary run', () => {
    // 60 teclas de 180ms dá uns 330 caracteres por minuto.
    expect(checkTimeline(timeline(60, 180, 40), LIMITS)).toEqual({ ok: true });
  });

  it('accepts a genuinely fast run', () => {
    // 120 ppm em prosa. Rápido, comum, e não pode ser chutado do ranking.
    expect(checkTimeline(timeline(120, 100, 30), LIMITS).ok).toBe(true);
  });

  it('refuses a clock that runs backwards', () => {
    const strokes = timeline(40, 150, 30);
    strokes[10] = { ...(strokes[10] as Keystroke), at: 0 };

    const verdict = checkTimeline(strokes, LIMITS);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('backwards') });
  });

  it('refuses a timeline compressed into no time at all', () => {
    // A fraude que o servidor antigo aceitava: tudo certo, o texto inteiro
    // entregue em alguns milissegundos, 60 mil palavras por minuto.
    const strokes = timeline(200, 1);
    const verdict = checkTimeline(strokes, LIMITS);

    expect(verdict.ok).toBe(false);
  });

  it('refuses a rate no hand reaches, however even the rhythm', () => {
    const verdict = checkTimeline(timeline(200, 20, 6), LIMITS);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({
      reason: expect.stringContaining('characters per minute'),
    });
  });

  it('refuses a rhythm too even to be a person', () => {
    // Velocidade plausível, variação zero: loop com sleep fixo.
    const verdict = checkTimeline(timeline(200, 150), LIMITS);
    expect(verdict.ok).toBe(false);
    expect(verdict).toMatchObject({ reason: expect.stringContaining('even') });
  });

  it('does not judge the rhythm of a run too short to have one', () => {
    // Dez intervalos iguais não provam máquina. São dez teclas.
    expect(checkTimeline(timeline(10, 150), LIMITS).ok).toBe(true);
  });

  it('accepts a run interrupted by a long pause', () => {
    const strokes = timeline(60, 150, 40);
    const paused = strokes.map((stroke, i) =>
      i < 30 ? stroke : { ...stroke, at: stroke.at + 40_000 },
    );

    expect(checkTimeline(paused, LIMITS).ok).toBe(true);
  });

  it('refuses an empty timeline', () => {
    expect(checkTimeline([], LIMITS).ok).toBe(false);
  });
});
