import { normalizeChar, toGraphemes } from './graphemes';
import type { Session, SessionOptions, SessionStatus } from './types';

const DEFAULT_OPTIONS: SessionOptions = { stopOnError: false, autoIndent: false };

/** What a newline may be followed by and have supplied for free. */
const INDENT = new Set([' ', '\t']);

export function createSession(
  target: string,
  options: Partial<SessionOptions> = {},
): Session {
  return {
    target: toGraphemes(target),
    typed: [],
    keystrokes: [],
    startedAt: null,
    finishedAt: null,
    options: { ...DEFAULT_OPTIONS, ...options },
    given: [],
  };
}

export function status(session: Session): SessionStatus {
  if (session.finishedAt !== null) return 'finished';
  if (session.startedAt !== null) return 'running';
  return 'idle';
}

export function isFinished(session: Session): boolean {
  return session.finishedAt !== null;
}

/** Position the caret sits at — always the length of what has been typed. */
export function cursor(session: Session): number {
  return session.typed.length;
}

/** True when the character at `index` was typed and does not match the target. */
export function isMistake(session: Session, index: number): boolean {
  const typed = session.typed[index];
  if (typed === undefined) return false;
  return typed !== session.target[index];
}

function blocked(session: Session): boolean {
  if (!session.options.stopOnError) return false;
  const last = session.typed.length - 1;
  return last >= 0 && isMistake(session, last);
}

/**
 * Commits one character.
 *
 * Feed this from the DOM's `beforeinput`/`input` data rather than `keydown`:
 * dead keys and IME composition only produce a final character there.
 * The clock starts on the first accepted character, never on render.
 */
export function applyInput(session: Session, input: string, at: number): Session {
  if (isFinished(session) || blocked(session)) return session;

  let next = session;
  for (const grapheme of toGraphemes(input)) {
    next = applyGrapheme(next, grapheme, at);
    if (isFinished(next) || blocked(next)) break;
  }
  return next;
}

function applyGrapheme(session: Session, char: string, at: number): Session {
  const index = session.typed.length;
  if (index >= session.target.length) return session;

  const normalized = normalizeChar(char);
  const correct = normalized === session.target[index];
  const typed = [...session.typed, normalized];
  const given = [...session.given];

  // A correct newline carries its indentation with it. Only a correct one: if
  // the typist pressed Enter where the target has something else, filling in
  // the next line's indentation would compound one mistake into several.
  if (session.options.autoIndent && correct && normalized === '\n') {
    for (let i = typed.length; i < session.target.length; i += 1) {
      const next = session.target[i];
      if (next === undefined || !INDENT.has(next)) break;
      typed.push(next);
      given.push(i);
    }
  }

  const done = typed.length === session.target.length;

  return {
    ...session,
    typed,
    given,
    keystrokes: [...session.keystrokes, { char: normalized, at, index, correct }],
    startedAt: session.startedAt ?? at,
    finishedAt: done ? at : null,
  };
}

/**
 * Removes the last character. Backspaces are not keystrokes — they do not enter
 * the timeline, so corrections never inflate the raw WPM.
 */
export function applyBackspace(session: Session, _at: number): Session {
  if (isFinished(session) || session.typed.length === 0) return session;

  // Whitespace the machine supplied comes off with the newline that caused it.
  // Leaving it behind would make undoing one Enter cost a dozen presses for
  // characters the typist never entered.
  const givenTail = new Set(session.given);
  let end = session.typed.length;
  while (end > 0 && givenTail.has(end - 1)) end -= 1;
  end -= 1;

  return {
    ...session,
    typed: session.typed.slice(0, end),
    given: session.given.filter((index) => index < end),
  };
}

/** Drops everything typed but keeps the target, for a restart on the same text. */
export function resetSession(session: Session): Session {
  return {
    ...session,
    typed: [],
    keystrokes: [],
    startedAt: null,
    finishedAt: null,
    given: [],
  };
}
