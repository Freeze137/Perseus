import type { Keystroke } from './types';

/**
 * What a timeline has to look like to have come from a hand.
 *
 * The limits arrive as an argument rather than being imported: this package
 * knows how to measure a timeline, and the question of how fast is too fast is
 * policy that belongs to whoever is doing the refusing. The server passes
 * TIMELINE_LIMITS from the contracts package; a test can pass its own.
 */
export type TimelineLimits = {
  readonly maxCpm: number;
  readonly minMedianGapMs: number;
  readonly minGapVariation: number;
  readonly variationSampleFloor: number;
};

export type TimelineVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Judges whether a keystroke timeline could have been produced by a person.
 *
 * This is the check the whole verification story was missing. Regenerating the
 * text and replaying the timeline proves the characters were right; it says
 * nothing about *when* they were pressed, and the timestamps are the one part
 * of a submission still written by the client. Without this, a forged clock
 * turns a correct replay into any speed the forger likes.
 *
 * What it can prove: the clock runs forwards, the gaps are not machine-uniform,
 * and the average rate is inside what a hand can do. What it cannot prove, and
 * does not pretend to: that a script typing at a believable speed in real time
 * is not a script. That signal is not in the timeline, and pretending otherwise
 * would buy false confidence rather than security.
 */
export function checkTimeline(
  keystrokes: readonly Keystroke[],
  limits: TimelineLimits,
): TimelineVerdict {
  if (keystrokes.length === 0) return { ok: false, reason: 'the timeline is empty' };

  const gaps: number[] = [];
  for (let i = 1; i < keystrokes.length; i += 1) {
    const previous = keystrokes[i - 1];
    const current = keystrokes[i];
    if (!previous || !current) continue;

    const gap = current.at - previous.at;
    // A clock that runs backwards is not a slow run or a fast one. It is a
    // timeline that was assembled rather than recorded.
    if (gap < 0) {
      return { ok: false, reason: 'the timeline goes backwards in time' };
    }
    gaps.push(gap);
  }

  const first = keystrokes[0];
  const last = keystrokes[keystrokes.length - 1];
  if (!first || !last) return { ok: false, reason: 'the timeline is empty' };

  const elapsedMs = last.at - first.at;
  // One keystroke has no duration and no rhythm; there is nothing here to
  // disbelieve. It is refused later for not finishing the text, not here.
  if (keystrokes.length < 2) return { ok: true };

  if (elapsedMs <= 0) {
    return { ok: false, reason: 'every keystroke claims the same instant' };
  }

  const cpm = (keystrokes.length / elapsedMs) * 60_000;
  if (cpm > limits.maxCpm) {
    return {
      ok: false,
      reason: `${Math.round(cpm)} characters per minute is beyond what a hand does`,
    };
  }

  const median = medianOf(gaps);
  if (median < limits.minMedianGapMs) {
    return {
      ok: false,
      reason: `a median gap of ${median.toFixed(1)}ms between keystrokes is not typing`,
    };
  }

  // Uniformity is the tell a forger rarely thinks to hide: human gaps wander by
  // tens of percent between one key and the next, and a loop with a fixed sleep
  // does not wander at all. Only judged once the sample is big enough that the
  // figure is a rhythm rather than an accident.
  if (gaps.length >= limits.variationSampleFloor) {
    const variation = coefficientOfVariation(gaps);
    if (variation < limits.minGapVariation) {
      return {
        ok: false,
        reason: 'the rhythm is too even to be a person',
      };
    }
  }

  return { ok: true };
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? (low + high) / 2 : high;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
