import { createSession } from './session';
import type { Keystroke, Session, SessionOptions } from './types';

/**
 * Rebuilds a finished session from its keystroke timeline.
 *
 * This exists so that a leaderboard can mean something. Numbers computed in a
 * browser are numbers anybody can type into a console, so the server does not
 * accept them: it regenerates the target from the run's own config, replays the
 * timeline against it here, and scores the result itself. The client's claimed
 * speed never enters the database.
 *
 * It replays by index rather than by appending, because the timeline is not a
 * sequence of appends. Backspaces are deliberately not recorded — a correction
 * must not flatter the raw speed — so a typist who fixes a character leaves two
 * keystrokes pointing at the same position, and the later one is what stands.
 *
 * Auto-indentation is re-derived rather than trusted: it follows from the
 * target and from where the newlines landed, so a submission cannot claim free
 * characters it was never given.
 */
export function replay(
  target: string,
  keystrokes: readonly Keystroke[],
  options: Partial<SessionOptions> = {},
): Session {
  const base = createSession(target, options);
  const typed: string[] = [];
  // A Set rather than an array with a membership scan: deep code indents the
  // same positions on every newline, and the scan made that quadratic in the
  // length of the run.
  const given = new Set<number>();
  let previousAt: number | null = null;

  for (const keystroke of keystrokes) {
    const { index, char, at } = keystroke;
    if (!Number.isInteger(index) || index < 0 || index >= base.target.length) {
      throw new ReplayError(`keystroke points outside the target: ${index}`);
    }
    // Every position up to this one has to already exist. A timeline that skips
    // ahead is claiming characters that were never typed.
    if (index > typed.length) {
      throw new ReplayError(`keystroke at ${index} skips past ${typed.length}`);
    }
    // Time only moves one way. Out of order timestamps are not a slow run or a
    // fast one — they are a timeline that was written rather than recorded, and
    // the metrics downstream read the first and last entry as the duration.
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
    // Correctness is recomputed against the target, never taken from the wire.
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
