/**
 * O que uma corrida conseguiu arrancar da tela, e o que isso significa.
 *
 * Separado do hook para poder ser interrogado com séries de tempos inventadas:
 * 60 Hz perfeito, 144 Hz perfeito, 240 Hz perfeito, com engasgo, com a aba
 * escondida. Enquanto isto morava dentro do `useEffect` a única forma de saber
 * se o aviso estava certo era abrir o site e torcer.
 */

export type FrameReport = {
  /** Quadros por segundo na média da amostra, pelo relógio de parede. */
  readonly fps: number;
  /**
   * O ritmo que esta tela sustentou, medido pela mediana dos intervalos. 60 na
   * maioria, 30 num painel fraco ou sob economia de bateria, 120 ou 240 num
   * monitor rápido.
   */
  readonly ceiling: number;
  /** Fração de quadros que perderam a batida da tela, 0–1. */
  readonly missed: number;
  /** Quanto tempo, em milissegundos, foi perdido nesses quadros. */
  readonly lostMs: number;
  readonly total: number;
  /** Se é a máquina ficando para trás, e não o ritmo da tela. */
  readonly struggling: boolean;
};

/**
 * Resolução do histograma: quartos de milissegundo.
 *
 * Um balde de 1 ms inteiro era o defeito. A 240 Hz o intervalo real é 4,17 ms;
 * arredondado para 4, a conta 1000/4 anuncia uma tela de **250 Hz** que não
 * existe, e transforma 4% de erro de medição em "quadros perdidos". A 144 Hz o
 * mesmo arredondamento (6,94 → 7) reporta 143. Em quartos de milissegundo o
 * erro cai para menos de 1,5% e o teto passa a descrever a tela.
 */
const STEP = 4;
/** Intervalos acima disto são a aba parada, não a tela desenhando. */
const MAX_MS = 64;
const BUCKETS = MAX_MS * STEP + 1;

/** Um quadro mais longo que isto vezes a batida perdeu pelo menos uma. */
const MISS_FACTOR = 1.6;

/**
 * Quando o aviso vale a pena aparecer.
 *
 * Duas condições, e as duas precisam valer. A fração sozinha dispara em
 * oscilação passageira — 12% num pico de dois décimos de segundo é ruído em
 * qualquer máquina, e era o que o limiar anterior de 10% acusava. O tempo
 * perdido sozinho dispararia numa corrida longa e saudável, onde meio segundo
 * espalhado por cinco minutos não é sentido por ninguém.
 *
 * Juntas descrevem o que a pessoa realmente vê: um quarto dos quadros no chão
 * *e* pelo menos um segundo inteiro de imagem que não apareceu.
 */
const MISS_SHARE = 0.25;
const MISS_LOST_MS = 1_000;

/** Abaixo disto os números não significam nada; uma corrida real tem milhares. */
export const MIN_SAMPLE = 240;

export function createHistogram(): Uint32Array {
  return new Uint32Array(BUCKETS);
}

/** Registra um intervalo. Sem alocação: é chamado a cada quadro. */
export function record(histogram: Uint32Array, deltaMs: number): void {
  const index = Math.min(BUCKETS - 1, Math.max(0, Math.round(deltaMs * STEP)));
  histogram[index] = (histogram[index] ?? 0) + 1;
}

/** Só para os testes: monta um histograma a partir de uma série de intervalos. */
export function histogramOf(deltas: readonly number[]): Uint32Array {
  const histogram = createHistogram();
  for (const delta of deltas) record(histogram, delta);
  return histogram;
}

/**
 * Lê o histograma e diz o que aconteceu.
 *
 * Devolve `null` quando a amostra é pequena demais para significar alguma
 * coisa — o que também é a resposta certa para uma corrida que passou escondida
 * numa aba de fundo, porque nesse caso o hook não registrou quadro nenhum.
 */
export function summarize(
  histogram: Uint32Array,
  frames: number,
  elapsedMs: number,
): FrameReport | null {
  if (frames < MIN_SAMPLE || elapsedMs <= 0) return null;

  // A batida da tela é a mediana dos intervalos.
  //
  // Não o quadro mais rápido de todos, que um único callback de 4 ms por acaso
  // faria uma tela de 60 Hz parecer de 250. E não o percentil 10, que era a
  // defesa anterior contra isso e trazia um viés próprio: com o tremor de
  // medição que todo navegador tem, o décimo mais rápido fica sistematicamente
  // abaixo do período real, e a tela de 240 Hz saía anunciada como 250 mesmo
  // depois de os baldes ficarem finos.
  //
  // A mediana é o estimador de período de uma série periódica, e aguenta até
  // metade dos quadros atrasados antes de se mexer. Acima disso ela acompanha o
  // ritmo que a máquina de fato sustentou — e aí a resposta certa é justamente
  // essa: uma máquina presa em 40 quadros firmes não está engasgando, está
  // devagar, e engasgo é o que este aviso existe para descrever.
  const beat = percentile(histogram, frames, 0.5);
  const threshold = beat * MISS_FACTOR;

  let missed = 0;
  let lostMs = 0;
  for (let index = 0; index < BUCKETS; index += 1) {
    const count = histogram[index] ?? 0;
    if (count === 0) continue;
    const ms = index / STEP;
    if (ms <= threshold) continue;
    missed += count;
    // O que se perdeu é o excesso sobre a batida, não o quadro inteiro: um
    // quadro de 33 ms numa tela de 60 Hz atrasou 16 ms, não 33.
    lostMs += count * (ms - beat);
  }

  const share = missed / frames;
  return {
    fps: Math.round((frames / elapsedMs) * 1_000),
    ceiling: beat > 0 ? Math.round(1_000 / beat) : 0,
    missed: share,
    lostMs: Math.round(lostMs),
    total: frames,
    struggling: share >= MISS_SHARE && lostMs >= MISS_LOST_MS,
  };
}

/** A duração num dado percentil, lida direto do histograma. */
function percentile(
  histogram: Uint32Array,
  total: number,
  fraction: number,
): number {
  const target = total * fraction;
  let seen = 0;
  for (let index = 0; index < BUCKETS; index += 1) {
    seen += histogram[index] ?? 0;
    if (seen >= target) return Math.max(1 / STEP, index / STEP);
  }
  return MAX_MS;
}
