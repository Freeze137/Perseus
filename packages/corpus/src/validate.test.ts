import { describe, expect, it } from 'vitest';
import type { Phrase } from './data/types';
import { validate, validateBanks, type Finding } from './validate';

/** One finding per line, grouped so a fix can be done bank by bank. */
function format(errors: readonly Finding[]): string {
  const byBank = new Map<string, Finding[]>();
  for (const error of errors) {
    const list = byBank.get(error.bank) ?? [];
    list.push(error);
    byBank.set(error.bank, list);
  }

  const lines: string[] = [];
  for (const [bank, list] of byBank) {
    lines.push(`\n${bank} — ${list.length} problema(s):`);
    for (const error of list) {
      lines.push(`  ${error.id}  [${error.rule}]  ${error.detail}`);
    }
  }
  return lines.join('\n');
}

/** The rules fired by one sentence, for asserting on a single case. */
function rulesFor(
  language: 'pt-BR' | 'en',
  text: string,
  tags: readonly string[] = ['teste'],
): string[] {
  const phrase: Phrase = { id: 'x-1', text, tags };
  const { errors } = validateBanks([{ bank: 'fixture', language, phrases: [phrase] }]);
  return errors.map((error) => error.rule);
}

describe('the banks', () => {
  it('has no errors in either bank', () => {
    const { errors } = validate();
    expect(errors.length, format(errors)).toBe(0);
  });
});

/**
 * Negative controls.
 *
 * Every rule is shown failing on a sentence built to break it. Without these,
 * a clean run of the real banks proves nothing: a checker whose regexes never
 * match reports zero errors just as loudly as one that works.
 */
describe('the checker', () => {
  it('accepts a sentence that is actually correct', () => {
    expect(
      rulesFor('pt-BR', 'O café esfriou enquanto eu procurava as chaves na mesa.'),
    ).toEqual([]);
    expect(
      rulesFor('en', 'The coffee went cold while I looked for the keys nearby.'),
    ).toEqual([]);
  });

  it('catches a dropped accent that has no correct bare form', () => {
    expect(
      rulesFor('pt-BR', 'Voce nao sabe o que aconteceu na rua ontem de noite.'),
    ).toContain('accent');
  });

  it('leaves a genuinely accented sentence alone', () => {
    expect(
      rulesFor('pt-BR', 'Você não sabe o que aconteceu na rua ontem de noite.'),
    ).not.toContain('accent');
  });

  it('catches a missing capital and a missing full stop', () => {
    const rules = rulesFor(
      'pt-BR',
      'sem letra maiúscula no começo e sem ponto final no fim disto',
    );
    expect(rules).toContain('capitalization');
    expect(rules).toContain('punctuation');
  });

  it('catches double spaces and typographic quotes', () => {
    const rules = rulesFor(
      'pt-BR',
      'A frase tem  espaço duplo e aspas “tortas” no meio dela.',
    );
    expect(rules).toContain('whitespace');
    expect(rules).toContain('quotes');
  });

  it('catches mojibake', () => {
    expect(
      rulesFor('pt-BR', 'O cafÃ© esfriou enquanto eu procurava as chaves na mesa.'),
    ).toContain('mojibake');
  });

  it('catches a sentence outside the length band', () => {
    expect(rulesFor('pt-BR', 'Curta demais.')).toContain('length');
  });

  it('catches a missing register tag', () => {
    expect(
      rulesFor('pt-BR', 'O café esfriou enquanto eu procurava as chaves.', []),
    ).toContain('tags');
  });

  it('catches European Portuguese, and spares the Brazilian spelling', () => {
    // A direção importa mais que a regra: é o brasileiro quem mantém o c em
    // "aspecto". Uma lista escrita ao contrário apagaria a grafia certa.
    expect(
      rulesFor('pt-BR', 'Os netos provam que algo de bom vem do facto de ter filhos.'),
    ).toContain('spelling');
    expect(
      rulesFor('pt-BR', 'O ignorante afirma e o sábio duvida e reflecte sobre isso.'),
    ).toContain('spelling');
    expect(
      rulesFor('pt-BR', 'Ele pegou o comboio das seis para chegar mais cedo.'),
    ).toContain('spelling');

    expect(
      rulesFor('pt-BR', 'O aspecto geral da sala melhorou bastante com a luz.'),
    ).not.toContain('spelling');
    expect(
      rulesFor('pt-BR', 'Os espectadores aplaudiram de pé no fim da apresentação.'),
    ).not.toContain('spelling');
    expect(
      rulesFor('pt-BR', 'A ação começou cedo e terminou antes do almoço.'),
    ).not.toContain('spelling');
  });

  it('catches a language that strayed into the wrong bank', () => {
    expect(
      rulesFor('en', 'The coffee went cold porque I looked for the keys nearby.'),
    ).toContain('language');
    expect(
      rulesFor('en', 'The café went cold while I looked for the keys nearby.'),
    ).toContain('accent');
  });

  it('catches an exact duplicate and a near-duplicate', () => {
    const text = 'O café esfriou enquanto eu procurava as chaves na mesa.';
    const exact = validateBanks([
      {
        bank: 'fixture',
        language: 'pt-BR',
        phrases: [
          { id: 'a', text, tags: ['t'] },
          { id: 'b', text, tags: ['t'] },
        ],
      },
    ]);
    expect(exact.errors.map((e) => e.rule)).toContain('duplicate');

    const near = validateBanks([
      {
        bank: 'fixture',
        language: 'pt-BR',
        phrases: [
          { id: 'a', text, tags: ['t'] },
          {
            id: 'b',
            text: 'O café esfriou enquanto eu procurava as chaves na cozinha.',
            tags: ['t'],
          },
        ],
      },
    ]);
    expect(near.errors.map((e) => e.rule)).toContain('near-duplicate');
  });

  it('catches a duplicate id', () => {
    const { errors } = validateBanks([
      {
        bank: 'fixture',
        language: 'pt-BR',
        phrases: [
          { id: 'a', text: 'O café esfriou enquanto procurava as chaves ali.', tags: ['t'] },
          { id: 'a', text: 'A janela ficou aberta e o quarto amanheceu gelado.', tags: ['t'] },
        ],
      },
    ]);
    expect(errors.map((e) => e.rule)).toContain('id');
  });

  it('reports an ambiguous accent for review instead of as an error', () => {
    const text = 'Especialistas afirmam que o resultado ainda pode mudar bastante.';
    const { errors, review } = validateBanks([
      { bank: 'fixture', language: 'pt-BR', phrases: [{ id: 'a', text, tags: ['t'] }] },
    ]);
    expect(errors).toEqual([]);
    expect(review.map((item) => item.word)).toContain('pode');
  });
});
