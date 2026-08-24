import { describe, expect, it } from "vitest";
import { histogramOf, MIN_SAMPLE, summarize } from "./frame-report";

/**
 * Uma tela mantendo a batida, com o tremor de medição que o navegador sempre
 * tem. Sem tremor a série seria mais limpa do que qualquer máquina real, e o
 * teste passaria a medir aritmética em vez de comportamento.
 */
function steady(hz: number, count: number): number[] {
  const beat = 1000 / hz;
  return Array.from(
    { length: count },
    (_, i) => beat + (((i * 37) % 7) - 3) * beat * 0.02,
  );
}

function report(deltas: number[]) {
  const elapsed = deltas.reduce((sum, d) => sum + d, 0);
  return summarize(histogramOf(deltas), deltas.length, elapsed);
}

describe("a tela mantendo o próprio ritmo", () => {
  // A tabela é o teste: era exatamente aqui que o balde de 1 ms mentia. 240 Hz
  // saía como 250, e 4% de erro de medição virava "quadros perdidos".
  it.each([
    [30, 30],
    [60, 60],
    [120, 120],
    [144, 144],
    [165, 165],
    [240, 240],
  ])("%i Hz é lido como %i, dentro de 3%%", (hz: number) => {
    const result = report(steady(hz, 2_000));
    expect(result).not.toBeNull();
    expect(result!.ceiling).toBeGreaterThan(hz * 0.97);
    expect(result!.ceiling).toBeLessThan(hz * 1.03);
  });

  it.each([30, 60, 120, 144, 240])("não avisa nada a %i Hz", (hz: number) => {
    const result = report(steady(hz, 2_000));
    expect(result!.struggling).toBe(false);
    expect(result!.missed).toBeLessThan(0.05);
  });
});

describe("a máquina ficando para trás", () => {
  it("avisa quando um terço dos quadros cai, por segundos a fio", () => {
    // Uma tela de 120 Hz entregando 40: a máquina alcança o triplo do que está
    // conseguindo, e isso é visível como engasgo, não como azar.
    const deltas = steady(120, 2_000).map((beat, i) =>
      i % 3 === 0 ? beat * 3 : beat,
    );
    const result = report(deltas)!;
    expect(result.ceiling).toBeGreaterThan(110);
    expect(result.missed).toBeGreaterThan(0.3);
    expect(result.lostMs).toBeGreaterThan(1_000);
    expect(result.struggling).toBe(true);
  });

  it("cala diante de um engasgo passageiro", () => {
    // Vinte quadros ruins numa corrida inteira: o limiar antigo, de 10% sem
    // exigir duração, acusava isto. É ruído em qualquer máquina.
    const deltas = steady(60, 2_000);
    for (let i = 0; i < 20; i += 1) deltas[i * 40] = 50;
    const result = report(deltas)!;
    expect(result.missed).toBeLessThan(0.25);
    expect(result.struggling).toBe(false);
  });

  it("cala quando a perda é grande em fração mas curta em tempo", () => {
    // As duas condições existem para isto: uma fração alta sobre uma amostra
    // pequena não é um segundo de imagem que ninguém viu.
    const deltas = steady(240, MIN_SAMPLE + 40).map((beat, i) =>
      i % 3 === 0 ? beat * 2 : beat,
    );
    const result = report(deltas)!;
    expect(result.missed).toBeGreaterThan(0.25);
    expect(result.lostMs).toBeLessThan(1_000);
    expect(result.struggling).toBe(false);
  });
});

describe("o que não é a máquina", () => {
  it("não trata uma tela lenta e constante como problema", () => {
    // 30 Hz num painel fraco, ou sob economia de bateria: mantém o tempo
    // perfeitamente. Dizer a essa pessoa que o hardware está sofrendo seria a
    // interface inventando um problema.
    const result = report(steady(30, 2_000))!;
    expect(result.ceiling).toBeGreaterThan(29);
    expect(result.struggling).toBe(false);
  });

  it("não reporta nada quando a amostra é curta demais", () => {
    expect(report(steady(60, MIN_SAMPLE - 1))).toBeNull();
  });

  it("uma corrida passada na aba de fundo não vira amostra", () => {
    // O hook não registra quadro com a aba escondida, então o que chega aqui é
    // uma amostra vazia — e a resposta certa para ela é não ter resposta.
    expect(summarize(histogramOf([]), 0, 0)).toBeNull();
  });

  it("ignora o tempo escondido em vez de contá-lo como quadro perdido", () => {
    // Se os intervalos gigantes da aba de fundo entrassem na conta, esta série
    // seria acusada. Ela é uma corrida saudável interrompida por uma troca de
    // aba, e o hook descarta esses intervalos antes de chegarem aqui.
    const healthy = steady(60, 2_000);
    const result = report(healthy)!;
    expect(result.struggling).toBe(false);

    const naive = report([...healthy, 4_000, 4_000, 4_000])!;
    expect(naive.lostMs).toBeGreaterThan(result.lostMs);
  });
});
