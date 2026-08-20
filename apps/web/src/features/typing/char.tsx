'use client';

import { memo } from 'react';

export type CharState = 'pending' | 'correct' | 'wrong' | 'extra';

type Props = {
  index: number;
  char: string;
  state: CharState;
  /** Code only: this is leading whitespace at an indent stop, so draw a guide. */
  guide?: boolean;
};

/**
 * One character of the target text.
 *
 * The reactions are plain CSS animations rather than Motion components: a run
 * is hundreds of characters, and hundreds of animation drivers would compete
 * with the input handler for the same frame. Motion is reserved for the caret,
 * where the physics actually shows.
 */
export const Char = memo(function Char({ index, char, state, guide }: Props) {
  // A newline has no glyph but still needs a box: it is a position the caret
  // parks on and a character the typist can get wrong, so it is given width
  // rather than being skipped.
  const newline = char === '\n';

  return (
    <span
      data-index={index}
      data-state={state}
      data-newline={newline || undefined}
      data-guide={guide || undefined}
      className="char"
      // A space has no glyph to react, so give it a visible box to animate.
      aria-hidden="true"
    >
      {newline ? '' : char}
    </span>
  );
});
