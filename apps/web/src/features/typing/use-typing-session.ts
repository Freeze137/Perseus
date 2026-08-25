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
 * A vista do React sobre o motor. As regras todas vivem no `@perseus/engine`;
 * este hook só carrega estado entre renders e anuncia teclas pra quem escuta
 * fora do React.
 */
export function useTypingSession(
  target: string,
  options: Partial<SessionOptions> = {},
) {
  // Desestruturado em primitivos antes de qualquer comparação. Quem chama passa
  // um literal de objeto, que é referência nova a cada render — comparar o
  // objeto reconstruiria a sessão sessenta vezes por segundo.
  const { autoIndent = false, stopOnError = false } = options;
  const settings: Partial<SessionOptions> = { autoIndent, stopOnError };

  const [state, setState] = useState<State>(() => ({
    target,
    session: createSession(target, settings),
  }));

  // Ajustar estado durante o render é o jeito suportado de zerar numa prop que
  // mudou — um efeito renderizaria o texto antigo uma vez antes de limpá-lo.
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
      // Anuncia só o que é novo, pra um re-render nunca repetir teclas antigas.
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
