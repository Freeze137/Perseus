"use client";

import {
  applyBackspace,
  applyInput,
  createSession,
  resetSession,
  type Session,
  type SessionOptions,
} from "@perseus/engine";
import { useCallback, useState } from "react";
import { emitKeystroke } from "@/lib/keystroke-bus";

type State = {
  target: string;
  session: Session;
};

/**
 * React's view of the engine. All the rules live in `@perseus/engine`; this
 * hook only carries state across renders and announces keystrokes to whoever
 * listens outside React.
 */
export function useTypingSession(
  target: string,
  options: Partial<SessionOptions> = {},
) {
  // Destructured to primitives before anything compares them. Callers pass an
  // object literal, which is a new reference on every render — comparing the
  // object itself would rebuild the session sixty times a second.
  const { autoIndent = false, stopOnError = false } = options;
  const settings: Partial<SessionOptions> = { autoIndent, stopOnError };

  const [state, setState] = useState<State>(() => ({
    target,
    session: createSession(target, settings),
  }));

  // Adjusting state during render is the supported way to reset on a prop
  // change — an effect would render the old text once before clearing it.
  const stale =
    state.target !== target ||
    state.session.options.autoIndent !== autoIndent ||
    state.session.options.stopOnError !== stopOnError;

  if (stale) {
    setState({ target, session: createSession(target, settings) });
  }

  const session = stale ? createSession(target, settings) : state.session;

  const commit = useCallback(
    (next: Session) => {
      setState((current) => ({ ...current, session: next }));
      // Announce only what is new, so a re-render never replays old keystrokes.
      next.keystrokes.slice(session.keystrokes.length).forEach(emitKeystroke);
    },
    [session.keystrokes.length],
  );

  const input = useCallback(
    (text: string) => commit(applyInput(session, text, performance.now())),
    [commit, session],
  );

  const backspace = useCallback(
    () => commit(applyBackspace(session, performance.now())),
    [commit, session],
  );

  const restart = useCallback(
    () => commit(resetSession(session)),
    [commit, session],
  );

  return { session, input, backspace, restart };
}
