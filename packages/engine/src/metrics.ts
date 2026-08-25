import type { KeyStat, Metrics, Session } from './types';

const MS_PER_MINUTE = 60_000;
/** Convenção de todo teste de digitação: "palavra" são cinco caracteres. */
const CHARS_PER_WORD = 5;

export function elapsedMs(session: Session, now: number = Date.now()): number {
  if (session.startedAt === null) return 0;
  return (session.finishedAt ?? now) - session.startedAt;
}

function countCorrect(session: Session): number {
  // Auto-indentação fica de fora: está na tela e está certa, mas foi a máquina
  // que pôs. Pagar por ela infla a corrida de código na medida em que o código
  // por acaso aninhou.
  const given = session.given.length > 0 ? new Set(session.given) : null;
  let correct = 0;
  for (let i = 0; i < session.typed.length; i += 1) {
    if (given?.has(i)) continue;
    if (session.typed[i] === session.target[i]) correct += 1;
  }
  return correct;
}

/**
 * Intervalo maior que isto é gente saindo do teclado, não digitando devagar.
 *
 * Constante local em vez de import: este pacote mede, e o número que define
 * pausa é o mesmo que o servidor usa pra julgar timeline
 * (TIMELINE_LIMITS.afkGapMs no @perseus/contracts). Batem de propósito. Mexeu
 * num, mexe no outro.
 */
const AFK_GAP_MS = 3_000;
/** Ritmo é amostrado por segundo, que é a unidade que a pessoa sente. */
const WINDOW_MS = 1_000;
/** Janela final menor que isto mede o rabo da corrida, não o ritmo. */
const MIN_TAIL_MS = 500;
/** Com menos janelas que isto a amostra não descreve ritmo nenhum. */
const MIN_WINDOWS = 3;

/**
 * Quão parelho é o ritmo, 0-100.
 *
 * É 100 menos o coeficiente de variação da taxa *por segundo*, não do intervalo
 * entre uma tecla e a próxima. Faz diferença pra quem é rápido: com rollover
 * dois caracteres caem 4ms um do outro e o seguinte leva 90ms, então a variância
 * por intervalo lê um bom digitador como errático enquanto o palavras-por-segundo
 * dele mal se mexe. O segundo é a unidade em que o ritmo é sentido.
 *
 * Pausa é excluída, não punida. Corrida interrompida por meio minuto tirava
 * zero — uma ida até a porta pesando mais que quatrocentas teclas parelhas —
 * o que media a interrupção, não a digitação. A interrupção continua custando
 * cada ponto de PPM que ela vale; só não apaga também o ritmo dos dois lados.
 *
 * Corrida curta cai no número por intervalo, senão meia dúzia de janelas viram
 * três números fingindo ser distribuição.
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

/** Intervalos entre teclas seguidas, tirando os de quem saiu do teclado. */
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
 * Caracteres por segundo, uma entrada por segundo de corrida, fora os segundos
 * que caíram dentro de pausa e o rabinho curto demais pra ser taxa.
 */
function ratePerWindow(
  strokes: Session['keystrokes'],
  start: number,
  end: number,
): number[] {
  const span = end - start;
  if (span <= 0) return [];

  const pauses = pauseIntervals(strokes);
  // Contado numa passada só, não varrendo a timeline por janela: corrida longa
  // tem centenas de janelas e milhares de teclas, e a versão quadrática disso é
  // o tipo de custo que só aparece em produção, na corrida mais longa, com
  // quem digita mais.
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
    // Todo segundo que a pausa encosta é descartado, não só os que ela engole
    // inteiros. A janela com as duas últimas teclas antes de alguém levantar é
    // um quinto de segundo de digitação virando um segundo cheio. Essas duas
    // bordas eram boa parte do que fazia corrida interrompida parecer errática
    // no número antigo.
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

/** Null quando a amostra não tem média pra variar em volta. */
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
  // Auto-indentação sai dos dois lados da conta. Tirar só do `correct`
  // reclassificaria calado todo espaço grátis como erro, e uma corrida de
  // código limpa reportaria erro que nunca aconteceu.
  const incorrect = session.typed.length - session.given.length - correct;
  const hits = session.keystrokes.filter((keystroke) => keystroke.correct).length;

  return {
    elapsedMs: elapsed,
    wpm: minutes > 0 ? correct / CHARS_PER_WORD / minutes : 0,
    cpm: minutes > 0 ? correct / minutes : 0,
    rawWpm: minutes > 0 ? session.keystrokes.length / CHARS_PER_WORD / minutes : 0,
    // Precisão é por tecla de propósito: erro corrigido com backspace
    // aconteceu, e esconder isso seria bajular quem está aprendendo.
    accuracy:
      session.keystrokes.length > 0 ? (hits / session.keystrokes.length) * 100 : 0,
    consistency: consistency(session),
    correct,
    incorrect,
  };
}

/**
 * Precisão e velocidade por caractere. É daqui que as lições adaptativas vão
 * ler quais teclas merecem mais treino.
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
