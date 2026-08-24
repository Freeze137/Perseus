import type { SessionConfig } from '@perseus/contracts';
import { describe, expect, it } from 'vitest';
import { advance, phraseAt, positionOf, seedFor } from './bag';
import type { Phrase } from './data/types';
import { drawCount, generate, phrases } from './generate';

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    language: 'pt-BR',
    kind: 'quote',
    length: 180,
    seed: 'perseus.0',
    durationMs: null,
    syntax: null,
    keyboardLayout: 'abnt2',
    ...overrides,
  };
}

/** Um banco pequeno, para poder esgotá-lo e olhar a virada de sacola. */
const pool: readonly Phrase[] = Array.from({ length: 20 }, (_, i) => ({
  id: `p-${i}`,
  text: `Frase número ${i}.`,
  tags: ['teste'],
}));

describe('a posição na seed', () => {
  it('vai e volta', () => {
    expect(positionOf('abc.17')).toEqual({ id: 'abc', cursor: 17 });
    expect(seedFor({ id: 'abc', cursor: 17 })).toBe('abc.17');
  });

  it('lê uma seed sem cursor como o topo da sacola', () => {
    // É isto que mantém o duelo intocado: o servidor escolhe uma seed simples
    // para a sala e nunca a avança, e os dois clientes pegam o topo.
    expect(positionOf('duelo-xyz')).toEqual({ id: 'duelo-xyz', cursor: 0 });
  });

  it('não confunde um ponto do id com o separador', () => {
    expect(positionOf('a.b.c.9')).toEqual({ id: 'a.b.c', cursor: 9 });
  });
});

describe('a sacola', () => {
  it('entrega o banco inteiro antes de repetir qualquer frase', () => {
    const seen = new Set<string>();
    for (let i = 0; i < pool.length; i += 1) {
      seen.add(phraseAt(pool, 'base', i).id);
    }
    expect(seen.size).toBe(pool.length);
  });

  it('embaralha de novo na virada, e não repete a frase da emenda', () => {
    const last = phraseAt(pool, 'base', pool.length - 1);
    const first = phraseAt(pool, 'base', pool.length);
    // O momento mais visível de todos: se a sacola virasse sem cuidado, a
    // última frase de uma passada poderia abrir a seguinte.
    expect(first.id).not.toBe(last.id);
  });

  it('dá ordens diferentes para bases diferentes', () => {
    const a = Array.from({ length: 20 }, (_, i) => phraseAt(pool, 'a', i).id);
    const b = Array.from({ length: 20 }, (_, i) => phraseAt(pool, 'b', i).id);
    expect(a).not.toEqual(b);
  });

  it('é determinística: a mesma base e posição dão a mesma frase', () => {
    expect(phraseAt(pool, 'base', 7).id).toBe(phraseAt(pool, 'base', 7).id);
    expect(phraseAt(pool, 'base', 43).id).toBe(phraseAt(pool, 'base', 43).id);
  });
});

/**
 * Quebra um texto gerado de volta nas frases do banco que o formaram.
 *
 * Contar orações não serve: uma entrada do banco pode trazer duas — "O que ele
 * está fazendo aí fora? Convide-o para entrar!" é uma frase só. Dividir por
 * ponto final contaria duas e a sacola teria consumido uma.
 *
 * A busca é pela mais longa primeiro, para que uma frase que comece igual a
 * outra não roube o casamento da maior.
 */
function intoPhrases(text: string, language: 'pt-BR' | 'en'): string[] {
  const bank = [...phrases(language)]
    .map((phrase) => phrase.text)
    .sort((a, b) => b.length - a.length);

  const found: string[] = [];
  let rest = text.trim();
  while (rest.length > 0) {
    const hit = bank.find((t) => rest === t || rest.startsWith(`${t} `));
    if (!hit) throw new Error(`sobrou texto fora do banco: ${rest.slice(0, 40)}`);
    found.push(hit);
    rest = rest.slice(hit.length).trimStart();
  }
  return found;
}

describe('gerar a partir da sacola', () => {
  it('não repete frase ao longo de muitas corridas seguidas', () => {
    // A queixa que originou tudo isto: com sorteio independente por corrida,
    // duas seguidas compartilhavam frase em uma de cada cinco vezes.
    const seen = new Set<string>();
    let position = { id: 'perseus', cursor: 0 };

    for (let run = 0; run < 200; run += 1) {
      const current = config({ seed: seedFor(position) });
      for (const phrase of intoPhrases(generate(current), 'pt-BR')) {
        expect(seen.has(phrase), `repetiu na corrida ${run}: ${phrase}`).toBe(false);
        seen.add(phrase);
      }
      position = advance(position, drawCount(current));
    }

    expect(seen.size).toBeGreaterThan(400);
  });

  it('conta o que a corrida realmente consumiu', () => {
    const current = config();
    expect(drawCount(current)).toBe(intoPhrases(generate(current), 'pt-BR').length);
  });

  it('avança pelo tamanho da corrida, não por um número fixo', () => {
    expect(drawCount(config({ length: 600 }))).toBeGreaterThan(
      drawCount(config({ length: 180 })),
    );
  });

  it('continua determinística para uma config inteira', () => {
    expect(generate(config())).toBe(generate(config()));
  });

  it('não deixa o cursor mudar a ordem, só a posição nela', () => {
    // A propriedade que separa uma sacola de um sorteio: avançar um passo tem
    // de andar dentro da mesma ordem, não produzir outra. Se o cursor entrasse
    // na semente do embaralhamento, cada avanço reembaralharia a pool — que é
    // amostragem com reposição de novo, agora vestida de sacola.
    const fromTop = intoPhrases(
      generate(config({ length: 600, seed: 'perseus.0' })),
      'pt-BR',
    );
    const fromOne = intoPhrases(
      generate(config({ length: 600, seed: 'perseus.1' })),
      'pt-BR',
    );
    expect(fromOne[0]).toBe(fromTop[1]);
    expect(fromOne[1]).toBe(fromTop[2]);
  });
});
