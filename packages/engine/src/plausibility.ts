import type { Keystroke } from './types';

/**
 * Com o que uma timeline tem que parecer pra ter saído de uma mão.
 *
 * Os limites chegam por argumento, não por import. Este pacote sabe medir
 * timeline; decidir o que é rápido demais é política de quem recusa. O
 * servidor passa TIMELINE_LIMITS do contracts, e um teste passa o dele.
 */
export type TimelineLimits = {
  readonly maxCpm: number;
  readonly minMedianGapMs: number;
  readonly minGapVariation: number;
  readonly variationSampleFloor: number;
};

export type TimelineVerdict =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: string };

/**
 * Julga se a timeline pode ter saído de uma pessoa.
 *
 * Era a checagem que faltava. Regerar o texto e reproduzir a timeline prova
 * quais caracteres foram digitados e não prova *quando* — e o timestamp é a
 * única parte do envio que ainda é escrita pelo cliente. Sem isso aqui, um
 * relógio forjado transforma um replay correto na velocidade que o cara quiser.
 *
 * Prova: relógio andando pra frente, intervalo que não é uniforme de máquina,
 * e média dentro do que uma mão faz.
 *
 * Não prova, e não finge provar: que um script digitando devagar e em tempo
 * real não é um script. Esse sinal não está na timeline. Fingir que está
 * compraria confiança falsa, que é pior que não ter checagem nenhuma.
 */
export function checkTimeline(
  keystrokes: readonly Keystroke[],
  limits: TimelineLimits,
): TimelineVerdict {
  if (keystrokes.length === 0) return { ok: false, reason: 'the timeline is empty' };

  const gaps: number[] = [];
  for (let i = 1; i < keystrokes.length; i += 1) {
    const previous = keystrokes[i - 1];
    const current = keystrokes[i];
    if (!previous || !current) continue;

    const gap = current.at - previous.at;
    // Relógio andando pra trás não é corrida lenta nem rápida. É timeline
    // montada, não gravada.
    if (gap < 0) {
      return { ok: false, reason: 'the timeline goes backwards in time' };
    }
    gaps.push(gap);
  }

  const first = keystrokes[0];
  const last = keystrokes[keystrokes.length - 1];
  if (!first || !last) return { ok: false, reason: 'the timeline is empty' };

  const elapsedMs = last.at - first.at;
  // Uma tecla só não tem duração nem ritmo, então não há o que desconfiar.
  // É recusada depois por não terminar o texto, não aqui.
  if (keystrokes.length < 2) return { ok: true };

  if (elapsedMs <= 0) {
    return { ok: false, reason: 'every keystroke claims the same instant' };
  }

  const cpm = (keystrokes.length / elapsedMs) * 60_000;
  if (cpm > limits.maxCpm) {
    return {
      ok: false,
      reason: `${Math.round(cpm)} characters per minute is beyond what a hand does`,
    };
  }

  const median = medianOf(gaps);
  if (median < limits.minMedianGapMs) {
    return {
      ok: false,
      reason: `a median gap of ${median.toFixed(1)}ms between keystrokes is not typing`,
    };
  }

  // Uniformidade é o vacilo que quase ninguém lembra de esconder: intervalo
  // humano varia dezenas de por cento de uma tecla pra outra, e loop com sleep
  // fixo não varia nada. Só olha isso quando a amostra já é grande o bastante
  // pro número ser ritmo e não acaso.
  if (gaps.length >= limits.variationSampleFloor) {
    const variation = coefficientOfVariation(gaps);
    if (variation < limits.minGapVariation) {
      return {
        ok: false,
        reason: 'the rhythm is too even to be a person',
      };
    }
  }

  return { ok: true };
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const low = sorted[middle - 1] ?? 0;
  const high = sorted[middle] ?? 0;
  return sorted.length % 2 === 0 ? (low + high) / 2 : high;
}

function coefficientOfVariation(values: readonly number[]): number {
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  if (mean <= 0) return 0;
  const variance =
    values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance) / mean;
}
