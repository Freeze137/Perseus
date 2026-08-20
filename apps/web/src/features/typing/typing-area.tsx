'use client';

import { isFinished, type Session } from '@perseus/engine';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Caret, type CaretTarget } from './caret';
import { Char, type CharState } from './char';

/**
 * Prose wraps and is centred; code does neither.
 *
 * The two are one component because everything that is hard here — the hidden
 * input, dead-key composition, caret measurement, focus recovery — is identical
 * for both. Only the arrangement of the characters differs, and splitting the
 * component would have meant maintaining that hard part twice.
 */
export type TypingLayout = 'prose' | 'code';

type Props = {
  session: Session;
  layout: TypingLayout;
  onInput: (text: string) => void;
  onBackspace: () => void;
  onRestart: () => void;
  /** Escape: abandon the run. The page decides whether that is allowed. */
  onCancel: () => void;
  /** Dips the text for one beat while a cancel swaps the target underneath. */
  swapping: boolean;
  /** Bumped by the page whenever an overlay closes, to take focus back. */
  focusSignal: number;
};

type Word = {
  /** Index of this word's first character in the target. */
  start: number;
  chars: readonly string[];
};

type Line = {
  /** Index of this line's first character in the target. */
  start: number;
  chars: readonly string[];
  /** How many leading characters are whitespace, for the indent guides. */
  indent: number;
};

/** A character's measured box. `width` is what puts the caret past the last one. */
type Placement = { x: number; y: number; width: number; height: number };

const EMPTY_CARET: CaretTarget = { x: 0, y: 0, height: 0 };
/** Lines of code kept visible above and below the caret while it scrolls. */
const SCROLL_MARGIN = 3;

export function TypingArea({
  session,
  layout,
  onInput,
  onBackspace,
  onRestart,
  onCancel,
  swapping,
  focusSignal,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState<CaretTarget>(EMPTY_CARET);
  const [focused, setFocused] = useState(false);

  const cursor = session.typed.length;
  const done = isFinished(session);
  const code = layout === 'code';
  const words = useMemo(
    () => (code ? [] : toWords(session.target)),
    [code, session.target],
  );
  const lines = useMemo(
    () => (code ? toLines(session.target) : []),
    [code, session.target],
  );

  const focus = useCallback(() => inputRef.current?.focus(), []);

  /**
   * Where every character sits, measured once and then read.
   *
   * This used to be a `querySelector` and three offset reads *per keystroke*.
   * Reading an offset with the DOM dirty — and it is always dirty, because the
   * character just typed changed its own class — forces the browser to lay out
   * the whole text synchronously before it can answer. On a two-thousand
   * character code run that is the single most expensive thing that happens
   * between a key going down and the letter appearing, which is precisely the
   * thing this product promises not to do.
   *
   * Character positions do not change when the cursor moves. They change when
   * the text changes, when the box changes width, or when the real font
   * finishes loading and every glyph resizes — so they are measured on exactly
   * those three events, and the keystroke path becomes an array lookup.
   */
  const positions = useRef<Placement[]>([]);
  const measuredFor = useRef<readonly string[] | null>(null);

  const measure = useCallback(() => {
    const text = textRef.current;
    if (!text) return;
    const next: Placement[] = [];
    // One pass, all reads together: the layout is flushed once for the whole
    // text rather than once per character. Indexed off the DOM rather than off
    // the target's length, which keeps this callback stable for the lifetime of
    // the component — see the observer below for why that matters.
    for (const element of text.querySelectorAll<HTMLElement>('[data-index]')) {
      const index = Number(element.dataset.index);
      next[index] = {
        x: element.offsetLeft,
        y: element.offsetTop,
        width: element.offsetWidth,
        height: element.offsetHeight,
      };
    }
    positions.current = next;
  }, []);

  const place = useCallback(() => {
    const spot = positions.current[Math.min(cursor, session.target.length - 1)];
    if (!spot) return;

    const atEnd = cursor >= session.target.length;
    setCaret({
      x: spot.x + (atEnd ? spot.width : 0),
      y: spot.y,
      height: spot.height,
    });

    // Prose fits on screen whole. Code does not, so the viewport follows the
    // caret instead — and it follows with a margin, because a caret pinned to
    // the bottom edge means typing blind into the next line.
    //
    // Only in code: `scrollTop` and `clientHeight` are themselves layout reads,
    // and there is no reason to make a prose run pay for a scroll that never
    // happens.
    if (!code) return;
    const viewport = viewportRef.current;
    if (!viewport) return;
    const margin = spot.height * SCROLL_MARGIN;
    const top = spot.y - margin;
    const bottom = spot.y + spot.height + margin;
    if (top < viewport.scrollTop) viewport.scrollTop = Math.max(0, top);
    else if (bottom > viewport.scrollTop + viewport.clientHeight) {
      viewport.scrollTop = bottom - viewport.clientHeight;
    }
  }, [code, cursor, session.target.length]);

  // Same layout pass as the render that moved it, so the caret never lags a
  // frame behind the character.
  useLayoutEffect(() => {
    placeRef.current = place;
    if (measuredFor.current !== session.target) {
      measure();
      measuredFor.current = session.target;
    }
    place();
  }, [cursor, session.target, measure, place]);

  /**
   * The latest `place`, reachable from a callback that must not be rebuilt.
   *
   * `place` closes over the cursor, so it is a new function on every keystroke.
   * An observer effect that depended on it would therefore tear down and
   * re-create a `ResizeObserver` on every keystroke — putting back onto the
   * critical path exactly the kind of work this whole section removed from it.
   */
  const placeRef = useRef(place);

  // The two things that move every character at once without the cursor moving
  // at all. A caret left on stale coordinates after a resize sits beside the
  // letter instead of on it.
  useEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const remeasure = () => {
      measure();
      placeRef.current();
    };

    const observer = new ResizeObserver(remeasure);
    observer.observe(text);
    // Web fonts land after first paint and change every glyph's width with
    // them; without this the caret is correct only until the font arrives.
    document.fonts?.ready.then(remeasure).catch(() => undefined);

    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    // `beforeinput` is the only event that reports the final character: on an
    // ABNT2 keyboard "´" then "a" fires two keydowns but composes one "á".
    const handleBeforeInput = (event: InputEvent) => {
      event.preventDefault();
      if (event.data) onInput(event.data);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Backspace') {
        event.preventDefault();
        onBackspace();
        return;
      }
      if (event.key === 'Enter') {
        event.preventDefault();
        // In code, Enter is a character in the target — it cannot also be the
        // restart shortcut. Restart moves to Ctrl+Enter there, and the button
        // is always available in both.
        if (code && !event.ctrlKey && !event.metaKey) onInput('\n');
        else onRestart();
      }
    };

    input.addEventListener('beforeinput', handleBeforeInput as EventListener);
    input.addEventListener('keydown', handleKeyDown);
    return () => {
      input.removeEventListener('beforeinput', handleBeforeInput as EventListener);
      input.removeEventListener('keydown', handleKeyDown);
    };
  }, [onInput, onBackspace, onRestart, code]);

  useEffect(() => {
    focus();
  }, [focus, session.target, focusSignal]);

  // Escape belongs to whatever sits on top. A drawer or the settings dialog
  // owns the key while it is open, and the check reads the DOM rather than
  // React state because the answer has to be right *in this event* — the state
  // that closes the panel has not re-rendered yet. One press, one action: the
  // run behind an open panel is never thrown away by the press that closes it.
  useEffect(() => {
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (document.querySelector('aside[data-open="true"], dialog[open]')) return;
      event.preventDefault();
      onCancel();
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onCancel]);

  // Any key anywhere brings the caret back, which is what "press any key" has
  // to mean. Shortcuts, Tab and open overlays are left alone.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (document.activeElement === inputRef.current) return;
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === 'Tab') return;
      if (document.querySelector('aside[data-open="true"], dialog[open]')) return;
      focus();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [focus]);

  return (
    <div
      className="typing-area"
      role="presentation"
      // preventDefault keeps the browser from moving focus to whatever was
      // clicked — without it the click steals focus straight back from the input.
      onPointerDown={(event) => {
        event.preventDefault();
        focus();
      }}
    >
      <input
        ref={inputRef}
        className="typing-input"
        value=""
        onChange={() => undefined}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        aria-label="Área de digitação"
      />

      <div
        ref={viewportRef}
        className="typing-viewport"
        data-layout={layout}
        data-blurred={!focused && !done}
        data-swapping={swapping}
      >
        <div ref={textRef} className="typing-text" data-layout={layout}>
          {code
            ? lines.map((line, number) => (
                <div
                  key={line.start}
                  className="code-line"
                  // The active line is marked in the DOM rather than computed in
                  // CSS: the caret is absolutely positioned, so nothing about the
                  // line itself would otherwise say which one is being typed.
                  data-active={isActive(line, cursor)}
                >
                  <span aria-hidden="true" className="code-gutter">
                    {number + 1}
                  </span>
                  <span className="code-content">
                    {line.chars.map((char, offset) => {
                      const index = line.start + offset;
                      return (
                        <Char
                          key={index}
                          index={index}
                          char={char}
                          state={stateOf(session, index, cursor)}
                          guide={isGuide(line, offset)}
                        />
                      );
                    })}
                  </span>
                </div>
              ))
            : /* Characters are grouped into words so lines break between words
                 and never in the middle of one. */
              words.map((word) => (
                <span key={word.start} className="word">
                  {word.chars.map((char, offset) => {
                    const index = word.start + offset;
                    return (
                      <Char
                        key={index}
                        index={index}
                        char={char}
                        state={stateOf(session, index, cursor)}
                      />
                    );
                  })}
                </span>
              ))}
          <Caret target={caret} />
        </div>
      </div>

      {!focused && !done ? (
        <p className="focus-veil" aria-hidden="true">
          Clique ou pressione qualquer tecla para focar
        </p>
      ) : null}
    </div>
  );
}

function toWords(target: readonly string[]): Word[] {
  const words: Word[] = [];
  let chars: string[] = [];
  let start = 0;

  target.forEach((char, index) => {
    if (chars.length === 0) start = index;
    chars.push(char);
    // The space stays attached to the word before it: it has to remain typeable
    // and it is what lets the line break here.
    if (char === ' ') {
      words.push({ start, chars });
      chars = [];
    }
  });
  if (chars.length > 0) words.push({ start, chars });

  return words;
}

/**
 * Splits the target on newlines, keeping each newline on the line it ends.
 *
 * The newline is a character the typist has to produce, so it stays in the
 * stream and keeps its index — it is only its glyph that is missing.
 */
function toLines(target: readonly string[]): Line[] {
  const lines: Line[] = [];
  let chars: string[] = [];
  let start = 0;

  target.forEach((char, index) => {
    if (chars.length === 0) start = index;
    chars.push(char);
    if (char === '\n') {
      lines.push({ start, chars, indent: leadingIndent(chars) });
      chars = [];
    }
  });
  if (chars.length > 0) lines.push({ start, chars, indent: leadingIndent(chars) });

  return lines;
}

function leadingIndent(chars: readonly string[]): number {
  let count = 0;
  while (chars[count] === ' ' || chars[count] === '\t') count += 1;
  return count;
}

/**
 * Whether this leading-whitespace column gets a guide.
 *
 * A tab is one indent level, so every tab gets one. Spaces are two per level
 * across this corpus, so every other one does — a rule on all of them would
 * turn the margin into a fence.
 */
function isGuide(line: Line, offset: number): boolean {
  if (offset >= line.indent) return false;
  return line.chars[offset] === '\t' || offset % 2 === 0;
}

function isActive(line: Line, cursor: number): boolean {
  return cursor >= line.start && cursor < line.start + line.chars.length;
}

function stateOf(session: Session, index: number, cursor: number): CharState {
  if (index >= cursor) return 'pending';
  return session.typed[index] === session.target[index] ? 'correct' : 'wrong';
}
