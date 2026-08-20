import type { KeyStat, Metrics, Session } from './types';

const MS_PER_MINUTE = 60_000;
/** The convention every typing test shares: a "word" is five characters. */
const CHARS_PER_WORD = 5;

export function elapsedMs(session: Session, now: number = Date.now()): number {
  if (session.startedAt === null) return 0;
  return (session.finishedAt ?? now) - session.startedAt;
}

function countCorrect(session: Session): number {
  // Auto-indentation is skipped: it is on screen and it is correct, but the
  // machine put it there. Paying for it would inflate a code run by however
  // deeply it happened to nest.
  const given = session.given.length > 0 ? new Set(session.given) : null;
  let correct = 0;
  for (let i = 0; i < session.typed.length; i += 1) {
    if (given?.has(i)) continue;
    if (session.typed[i] === session.target[i]) correct += 1;
  }
  return correct;
}

/**
 * A gap longer than this is somebody leaving the keyboard, not typing slowly.
 *
 * Kept as a local constant rather than imported: this package measures, and the
 * number that decides what counts as a pause is the same one the server uses to
 * judge a timeline (TIMELINE_LIMITS.afkGapMs in @perseus/contracts). They agree
 * on purpose; if one moves, move the other.
 */
const AFK_GAP_MS = 3_000;
/** Rhythm is sampled per second, the unit a typist can actually feel. */
const WINDOW_MS = 1_000;
/** A trailing window shorter than this measures the tail, not the rhythm. */
const MIN_TAIL_MS = 500;
/** Below this many windows the sample is too small to describe a rhythm. */
const MIN_WINDOWS = 3;

/**
 * Evenness of rhythm, 0-100.
 *
 * Measured as 100 minus the coefficient of variation of the *per-second* rate,
 * not of the gap between one key and the next. The distinction matters for
 * anyone fast: rollover means two characters genuinely land 4ms apart and the
 * next takes 90ms, so gap-level variance reads a good typist as erratic while
 * their words-per-second barely moves. The second is the unit the rhythm is
 * actually felt in.
 *
 * Pauses are excluded rather than punished. A run interrupted by half a minute
 * used to score zero — one trip to the door outweighing four hundred evenly
 * struck keys — which measured the interruption instead of the typing. The
 * interruption still costs the typist every point of WPM it is worth; it does
 * not also get to erase the rhythm they kept on either side of it.
 *
 * Short runs fall back to the gap-level figure, where a handful of windows
 * would otherwise be three numbers pretending to be a distribution.
 */
function consistency(session: Session): number {
  const strokes = session.keystrokes;
  if (strokes.length < 3) return 0;

  const first = strokes[0];
  const last = strokes[strokes.length - 1];
  if (!first || !last) return 0;

  const end = session.finishedAt ?? last.at;
  const windows = ratePerWindow(strokes, first.at, end);

  if (windows.length >= MIN_WINDOWS) {
    const variation = coefficientOfVariation(windows);
    return variation === null ? 0 : clamp(100 * (1 - variation), 0, 100);
  }

  const gaps = typingGaps(strokes);
  if (gaps.length < 2) return 0;
  const variation = coefficientOfVariation(gaps);
  return variation === null ? 0 : clamp(100 * (1 - variation), 0, 100);
}

/** Gaps between consecutive keystrokes, with the away-from-keyboard ones out. */
function typingGaps(strokes: Session['keystrokes']): number[] {
  const gaps: number[] = [];
  for (let i = 1; i < strokes.length; i += 1) {
    const previous = strokes[i - 1];
    const current = strokes[i];
    if (!previous || !current) continue;
    const gap = current.at - previous.at;
    if (gap >= 0 && gap <= AFK_GAP_MS) gaps.push(gap);
  }
  return gaps;
}

/**
 * Characters per second, one entry per second of the run, minus the seconds
 * that fell inside a pause and a trailing sliver too short to be a rate.
 */
function ratePerWindow(
  strokes: Session['keystrokes'],
  start: number,
  end: number,
): number[] {
  const span = end - start;
  if (span <= 0) return [];

  const pauses = pauseIntervals(strokes);
  // Tallied in one pass rather than by scanning the timeline once per window:
  // a long run has hundreds of windows and thousands of keystrokes, and the
  // quadratic version of this is the kind of cost that only shows up in
  // production, on the longest runs, from the people who type the most.
  const tally = new Map<number, number>();
  for (const stroke of strokes) {
    const window = Math.floor((stroke.at - start) / WINDOW_MS);
    tally.set(window, (tally.get(window) ?? 0) + 1);
  }

  const counts: number[] = [];
  for (let window = 0; ; window += 1) {
    const from = start + window * WINDOW_MS;
    if (from >= end) break;
    const to = Math.min(from + WINDOW_MS, end);
    if (to - from < MIN_TAIL_MS) break;
    // Any second a pause touches is thrown out, not just the ones it swallows
    // whole. A window holding the last two keystrokes before somebody stood up
    // is a fifth of a second of typing being reported as a full second of it,
    // and those two edges were most of what made an interrupted run look
    // erratic under the old figure.
    if (pauses.some((pause) => from < pause.to && to > pause.from)) continue;
    counts.push(tally.get(window) ?? 0);
  }

  return counts;
}

function pauseIntervals(
  strokes: Session['keystrokes'],
): { from: number; to: number }[] {
  const pauses: { from: number; to: number }[] = [];
  for (let i = 1; i < strokes.length; i += 1) {
    const previous = strokes[i - 1];
    const current = strokes[i];
    if (!previous || !current) continue;
    if (current.at - previous.at > AFK_GAP_MS) {
      pauses.push({ from: previous.at, to: current.at });
    }
  }
  return pauses;
}

/** Null when the sample has no mean to vary around. */
function coefficientOfVariation(values: readonly number[]): number | null {
  if (values.length < 2) return null;
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return null;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}

export function metrics(session: Session, now: number = Date.now()): Metrics {
  const elapsed = elapsedMs(session, now);
  const minutes = elapsed / MS_PER_MINUTE;
  const correct = countCorrect(session);
  // Auto-indentation is excluded from both sides of the ledger. Subtracting it
  // from `correct` alone would silently reclassify every free space as a
  // mistake, and a clean code run would report errors it never made.
  const incorrect = session.typed.length - session.given.length - correct;
  const hits = session.keystrokes.filter((keystroke) => keystroke.correct).length;

  return {
    elapsedMs: elapsed,
    wpm: minutes > 0 ? correct / CHARS_PER_WORD / minutes : 0,
    cpm: minutes > 0 ? correct / minutes : 0,
    rawWpm: minutes > 0 ? session.keystrokes.length / CHARS_PER_WORD / minutes : 0,
    // Accuracy is keystroke-level on purpose: an error fixed with backspace
    // still happened, and hiding it would flatter the learner.
    accuracy:
      session.keystrokes.length > 0 ? (hits / session.keystrokes.length) * 100 : 0,
    consistency: consistency(session),
    correct,
    incorrect,
  };
}

/**
 * Per-character accuracy and speed. This is what future adaptive lessons read
 * to decide which keys deserve more drilling.
 */
export function keyStats(session: Session): KeyStat[] {
  type Accumulator = { typed: number; errors: number; latencyTotal: number; latencySamples: number };
  const byKey = new Map<string, Accumulator>();

  session.keystrokes.forEach((keystroke, position) => {
    const expected = session.target[keystroke.index];
    if (expected === undefined) return;

    const entry = byKey.get(expected) ?? {
      typed: 0,
      errors: 0,
      latencyTotal: 0,
      latencySamples: 0,
    };
    entry.typed += 1;
    if (!keystroke.correct) entry.errors += 1;

    const previous = session.keystrokes[position - 1];
    if (previous) {
      entry.latencyTotal += keystroke.at - previous.at;
      entry.latencySamples += 1;
    }
    byKey.set(expected, entry);
  });

  return Array.from(byKey, ([key, entry]) => ({
    key,
    typed: entry.typed,
    errors: entry.errors,
    avgLatencyMs:
      entry.latencySamples > 0 ? entry.latencyTotal / entry.latencySamples : 0,
  })).sort((a, b) => b.errors - a.errors || a.key.localeCompare(b.key));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
