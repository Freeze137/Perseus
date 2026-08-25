'use client';

import { isFinished, type Session } from '@perseus/engine';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Caret, type CaretTarget } from './caret';
import { Char, type CharState } from './char';

/**
 * Prosa quebra linha e fica centralizada; código não faz nenhum dos dois.
 *
 * Os dois são um componente só porque tudo que é difícil aqui — o input
 * escondido, a composição de tecla morta, a medida do cursor, a recuperação do
 * foco — é idêntico pros dois. Só o arranjo dos caracteres muda, e separar o
 * componente significaria manter a parte difícil duas vezes.
 */
export type TypingLayout = 'prose' | 'code';

type Props = {
  session: Session;
  layout: TypingLayout;
  onInput: (text: string) => void;
  onBackspace: () => void;
  onRestart: () => void;
  /** Escape: abandona a corrida. A página decide se isso é permitido. */
  onCancel: () => void;
  /** Abaixa o texto por uma batida enquanto um cancelamento troca o alvo embaixo. */
  swapping: boolean;
  /** Incrementado pela página sempre que uma camada fecha, pra retomar o foco. */
  focusSignal: number;
};

type Word = {
  /** Índice do primeiro caractere desta palavra no alvo. */
  start: number;
  chars: readonly string[];
};

type Line = {
  /** Índice do primeiro caractere desta linha no alvo. */
  start: number;
  chars: readonly string[];
  /** Quantos caracteres iniciais são espaço, pras guias de indentação. */
  indent: number;
};

/** A caixa medida de um caractere. `width` é o que põe o cursor depois do último. */
type Placement = { x: number; y: number; width: number; height: number };

const EMPTY_CARET: CaretTarget = { x: 0, y: 0, height: 0 };
/** Linhas de código mantidas visíveis acima e abaixo do cursor enquanto ele rola. */
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
   * Onde cada caractere está, medido uma vez e depois lido.
   *
   * Isto era um `querySelector` e três leituras de offset *por tecla*. Ler
   * offset com o DOM sujo — e ele está sempre sujo, porque o caractere que
   * acabou de ser digitado mudou a própria classe — obriga o browser a fazer o
   * layout do texto inteiro de forma síncrona antes de responder. Numa corrida
   * de código de dois mil caracteres essa é a coisa mais cara que acontece
   * entre a tecla descer e a letra aparecer, que é exatamente o que este
   * produto promete não fazer.
   *
   * Posição de caractere não muda quando o cursor anda. Muda quando o texto
   * muda, quando a caixa muda de largura, ou quando a fonte de verdade termina
   * de carregar e todo glifo redimensiona — então são medidas exatamente nesses
   * três eventos, e o caminho da tecla vira uma consulta a array.
   */
  const positions = useRef<Placement[]>([]);
  const measuredFor = useRef<readonly string[] | null>(null);

  const measure = useCallback(() => {
    const text = textRef.current;
    if (!text) return;
    const next: Placement[] = [];
    // Uma passada, todas as leituras juntas: o layout é resolvido uma vez pro
    // texto inteiro em vez de uma por caractere. Indexado pelo DOM e não pelo
    // tamanho do alvo, o que mantém este callback estável pela vida do
    // componente — ver o observer abaixo pra por que isso importa.
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

    // Prosa cabe inteira na tela. Código não, então a viewport segue o cursor —
    // e segue com margem, porque cursor grudado na borda de baixo é digitar às
    // cegas na linha seguinte.
    //
    // Só em código: `scrollTop` e `clientHeight` são leituras de layout, e não
    // há motivo pra corrida de prosa pagar por um scroll que nunca acontece.
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

  // Mesma passada de layout do render que o moveu, pro cursor nunca ficar um
  // frame atrás do caractere.
  useLayoutEffect(() => {
    placeRef.current = place;
    if (measuredFor.current !== session.target) {
      measure();
      measuredFor.current = session.target;
    }
    place();
  }, [cursor, session.target, measure, place]);

  /**
   * O `place` mais recente, alcançável de um callback que não pode ser
   * reconstruído.
   *
   * `place` fecha sobre o cursor, então é uma função nova a cada tecla. Um
   * efeito de observer que dependesse dele derrubaria e recriaria um
   * `ResizeObserver` a cada tecla — pondo de volta no caminho crítico
   * exatamente o tipo de trabalho que esta seção inteira tirou dele.
   */
  const placeRef = useRef(place);

  // As duas coisas que movem todo caractere de uma vez sem o cursor andar. Um
  // cursor deixado em coordenada velha depois de um resize fica ao lado da
  // letra em vez de em cima dela.
  useEffect(() => {
    const text = textRef.current;
    if (!text) return;

    const remeasure = () => {
      measure();
      placeRef.current();
    };

    const observer = new ResizeObserver(remeasure);
    observer.observe(text);
    // Fonte web chega depois da primeira pintura e muda a largura de todo glifo
    // junto; sem isto o cursor só está certo até a fonte chegar.
    document.fonts?.ready.then(remeasure).catch(() => undefined);

    return () => observer.disconnect();
  }, [measure]);

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    // `beforeinput` é o único evento que reporta o caractere final: num teclado
    // ABNT2 "´" e depois "a" dispara dois keydown mas compõe um "á".
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
        // Em código, Enter é um caractere do alvo — não pode ser também o
        // atalho de recomeçar. Lá recomeçar vira Ctrl+Enter, e o botão está
        // sempre disponível nos dois.
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

  // Escape pertence ao que estiver por cima. Uma gaveta ou o diálogo de
  // configurações é dono da tecla enquanto está aberto, e a checagem lê o DOM e
  // não o estado do React porque a resposta tem que estar certa *neste evento* —
  // o estado que fecha o painel ainda não re-renderizou. Um aperto, uma ação: a
  // corrida atrás de um painel aberto nunca é jogada fora pelo aperto que o fecha.
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

  // Qualquer tecla em qualquer lugar traz o cursor de volta, que é o que
  // "aperte qualquer tecla" tem que significar. Atalho, Tab e camada aberta
  // ficam de fora.
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
      // preventDefault impede o browser de mover o foco pro que foi clicado —
      // sem isso o clique rouba o foco do input na hora.
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
                  // A linha ativa é marcada no DOM em vez de calculada no CSS:
                  // o cursor é posicionado de forma absoluta, então nada na
                  // linha em si diria qual está sendo digitada.
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
    // O espaço fica grudado na palavra anterior: ele tem que continuar
    // digitável e é o que permite a linha quebrar ali.
    if (char === ' ') {
      words.push({ start, chars });
      chars = [];
    }
  });
  if (chars.length > 0) words.push({ start, chars });

  return words;
}

/**
 * Quebra o alvo nas quebras de linha, mantendo cada uma na linha que ela
 * encerra.
 *
 * A quebra de linha é um caractere que a pessoa tem que produzir, então fica no
 * fluxo e mantém o índice — o que falta é só o glifo dela.
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
 * Se esta coluna de espaço inicial ganha uma guia.
 *
 * Tab é um nível de indentação, então todo tab ganha uma. Espaço é dois por
 * nível neste corpus, então um sim e um não — uma régua em todos transformaria
 * a margem numa cerca.
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
