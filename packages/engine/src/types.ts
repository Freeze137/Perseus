/**
 * A single character committed by the user, with the moment it happened.
 * `index` is the position in the target it was compared against.
 */
export type Keystroke = {
  readonly char: string;
  readonly at: number;
  readonly index: number;
  readonly correct: boolean;
};

export type SessionStatus = 'idle' | 'running' | 'finished';

export type SessionOptions = {
  /** Stop accepting input at the first mistake instead of marking and moving on. */
  readonly stopOnError: boolean;
  /**
   * On a newline, advance past the indentation that follows it.
   *
   * For code. Leading whitespace is not a skill — every editor in existence
   * supplies it — and making the typist count spaces would drill the one part
   * of writing code that nobody does by hand.
   */
  readonly autoIndent: boolean;
};

/**
 * Immutable snapshot of a typing run.
 *
 * `target` and `typed` are grapheme arrays, not strings: on ABNT2 keyboards a
 * dead key plus a vowel yields one visible character made of two code points,
 * and the user experiences it as a single keystroke.
 */
export type Session = {
  readonly target: readonly string[];
  readonly typed: readonly string[];
  readonly keystrokes: readonly Keystroke[];
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly options: SessionOptions;
  /**
   * Positions the machine filled in, not the typist — auto-indentation.
   *
   * They advance the caret but they are not credit: counting them as correct
   * characters would pay a code typist for whitespace they never pressed, and
   * the whole point of measuring is that the number means something.
   */
  readonly given: readonly number[];
};

export type Metrics = {
  readonly elapsedMs: number;
  /** Correct characters only, the standard 5-chars-per-word measure. */
  readonly wpm: number;
  /**
   * Correct characters per minute, undivided.
   *
   * The five-character word is a convention borrowed from English prose. Code
   * has no words in that sense — `=>`, `!==` and a nested closing brace are all
   * real work that the divisor flattens — so code runs are read in CPM, and the
   * number is exposed for prose too rather than being a special case.
   */
  readonly cpm: number;
  /** Every character typed, mistakes included. */
  readonly rawWpm: number;
  /** 0-100. */
  readonly accuracy: number;
  /** 0-100. Evenness of the rhythm between keystrokes. */
  readonly consistency: number;
  readonly correct: number;
  readonly incorrect: number;
};

export type KeyStat = {
  readonly key: string;
  readonly typed: number;
  readonly errors: number;
  /** Mean gap between the previous keystroke and this one, in ms. */
  readonly avgLatencyMs: number;
};
