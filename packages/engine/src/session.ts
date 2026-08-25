import { normalizeChar, toGraphemes } from './graphemes';
import type { Session, SessionOptions, SessionStatus } from './types';

const DEFAULT_OPTIONS: SessionOptions = { stopOnError: false, autoIndent: false };

/** O que pode vir depois da quebra de linha e ser dado de graça. */
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

/** Onde o cursor está: sempre o tamanho do que já foi digitado. */
export function cursor(session: Session): number {
  return session.typed.length;
}

/** True quando o caractere em `index` foi digitado e não bate com o alvo. */
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
 * Confirma um caractere.
 *
 * Alimenta isto com o dado do `beforeinput`/`input`, não do `keydown`: tecla
 * morta e composição de IME só viram caractere final lá. O relógio começa no
 * primeiro caractere aceito, nunca no render.
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

  // Quebra de linha certa traz a indentação junto. Só a certa: se a pessoa
  // apertou Enter onde o alvo tem outra coisa, preencher a indentação da linha
  // seguinte transformaria um erro em vários.
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
 * Apaga o último caractere. Backspace não é tecla: não entra na timeline, então
 * correção nunca infla o PPM bruto.
 */
export function applyBackspace(session: Session, _at: number): Session {
  if (isFinished(session) || session.typed.length === 0) return session;

  // O espaço que a máquina pôs sai junto com a quebra que o causou. Deixar
  // pra trás faria desfazer um Enter custar uma dúzia de backspaces por
  // caractere que a pessoa nunca digitou.
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

/** Joga fora o digitado e mantém o alvo, pra recomeçar no mesmo texto. */
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
