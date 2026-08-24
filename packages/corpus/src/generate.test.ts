import { SyntaxSchema, type SessionConfig } from '@perseus/contracts';
import { describe, expect, it } from 'vitest';
import { PHRASES_EN } from './data/phrases-en';
import { PHRASES_PT_BR } from './data/phrases-pt-br';
import { SNIPPETS, type Snippet } from './data/snippets';
import { difficultyOf } from './difficulty';
import { generate, phrases } from './generate';
import { createRandom } from './random';

function config(overrides: Partial<SessionConfig> = {}): SessionConfig {
  return {
    language: 'pt-BR',
    kind: 'words',
    length: 120,
    seed: 'perseus',
    durationMs: null,
    syntax: null,
    keyboardLayout: 'abnt2',
    ...overrides,
  };
}

/**
 * Whether a plain US keyboard could have produced every character.
 *
 * Written against code points rather than as a regex so the range it means is
 * on screen: printable ASCII, plus the newline and tab that code carries.
 */
function isAsciiTypeable(text: string): boolean {
  return [...text].every((char) => {
    const code = char.codePointAt(0) ?? 0;
    return (code >= 0x20 && code <= 0x7e) || code === 0x0a || code === 0x09;
  });
}

describe('generate', () => {
  it('is deterministic for the same seed', () => {
    expect(generate(config())).toBe(generate(config()));
  });

  it('produces different text for a different seed', () => {
    expect(generate(config())).not.toBe(generate(config({ seed: 'outro' })));
  });

  it('produces different text per language', () => {
    expect(generate(config())).not.toBe(generate(config({ language: 'en' })));
  });

  it('reaches at least the requested length', () => {
    expect(generate(config({ length: 300 })).length).toBeGreaterThanOrEqual(300);
  });

  it('keeps Portuguese accents in the pt-BR corpus', () => {
    const text = generate(config({ length: 800 }));
    expect(text).toMatch(/[áàâãéêíóôõúç]/);
  });

  it('produces different text per keyboard reach', () => {
    expect(generate(config())).not.toBe(
      generate(config({ keyboardLayout: 'us' })),
    );
  });

  it('gives ABNT2 and US-International the same text', () => {
    // They reach the same characters. A typist who switches between the two
    // has not changed which sentences they can type, so the draw must not move.
    expect(generate(config({ keyboardLayout: 'abnt2' }))).toBe(
      generate(config({ keyboardLayout: 'us-intl' })),
    );
  });

  it('draws nothing a US keyboard cannot type', () => {
    for (const kind of ['words', 'quote', 'punctuation', 'numbers'] as const) {
      for (const language of ['pt-BR', 'en'] as const) {
        const text = generate(
          config({ kind, language, keyboardLayout: 'us', length: 2_000 }),
        );
        expect(text.length).toBeGreaterThan(0);
        expect(isAsciiTypeable(text)).toBe(true);
      }
    }
  });

  it('leaves the English corpus untouched by the layout', () => {
    // Nothing in it is outside ASCII, so every layout draws the same bank.
    expect(generate(config({ language: 'en' }))).toBe(
      generate(config({ language: 'en', keyboardLayout: 'us' })),
    );
  });

  it('keeps every snippet typeable on every layout', () => {
    // The code seed leaves the keyboard out on the strength of this. If a
    // snippet ever arrives carrying an accent, this fails before the seed
    // silently starts handing two keyboards the same unreachable text.
    for (const snippet of SNIPPETS) {
      expect(isAsciiTypeable(snippet.code)).toBe(true);
    }
  });

  it('draws the same code whatever the keyboard', () => {
    expect(generate(config({ kind: 'code' }))).toBe(
      generate(config({ kind: 'code', keyboardLayout: 'us' })),
    );
  });

  it('leaves the words mode without capitals or punctuation', () => {
    const text = generate(config({ kind: 'words', length: 400 }));
    expect(text).not.toMatch(/[A-ZÁÂÃÉÊÍÓÔÕÚÇ.,;:!?]/);
  });

  it('mixes digits into the numbers mode', () => {
    expect(generate(config({ kind: 'numbers', length: 400 }))).toMatch(/\d/);
  });
});

/**
 * The rule the whole corpus exists to keep: nothing reaches the user that was
 * not written as a sentence by a person.
 *
 * This is the test that has to fail the day somebody reintroduces a builder
 * that concatenates random tokens. It does not inspect the builders — it takes
 * the output apart and proves every piece of it came out of the phrase bank,
 * which no amount of shuffled words can satisfy.
 */
/**
 * Consumes the text from the left, one bank sentence at a time. Longest first,
 * so a sentence that happens to start with a shorter one cannot be mis-consumed
 * and report a false failure.
 *
 * Whole sentences rather than clauses. A bank entry can hold two of them — "O
 * que ele está fazendo aí fora? Convide-o para entrar!" is one phrase — so
 * splitting the generated text on terminal punctuation and looking each piece
 * up would fail on an entry that is perfectly well drawn.
 */
function consumedBy(text: string, pieces: readonly string[]): boolean {
  const ordered = [...pieces].sort((a, b) => b.length - a.length);
  let rest = text;
  while (rest.length > 0) {
    const piece = ordered.find((p) => rest === p || rest.startsWith(`${p} `));
    if (!piece) return false;
    rest = rest.slice(piece.length).trimStart();
  }
  return true;
}

describe('every builder draws from the phrase bank', () => {
  const KINDS = ['words', 'quote', 'punctuation', 'numbers'] as const;
  const LANGUAGES = ['pt-BR', 'en'] as const;

  /** The same transform the `words` mode applies, so its output can match. */
  const stripped = (text: string) => text.toLowerCase().replaceAll('.', '');

  for (const language of LANGUAGES) {
    const bank = phrases(language);
    const sentences = bank.map((phrase) => phrase.text);

    for (const kind of KINDS) {
      it(`${language}/${kind}: is nothing but whole bank sentences`, () => {
        const text = generate(config({ language, kind, length: 400 }));
        expect(text.length).toBeGreaterThan(0);
        const pieces = kind === 'words' ? sentences.map(stripped) : sentences;
        expect(consumedBy(text, pieces)).toBe(true);
      });
    }
  }

  it('rejects text stitched from loose words, which is the point', () => {
    const soup = 'casa rua tempo pessoa mundo vida';
    expect(consumedBy(soup, PHRASES_PT_BR.map((phrase) => phrase.text))).toBe(false);
  });
});

describe('generate: words mode', () => {
  it('draws real sentences, only without their capitals and full stops', () => {
    const text = generate(config({ kind: 'words', length: 300 }));
    const simple = phrases('pt-BR').filter((phrase) =>
      /^[\p{L}\p{M} ]+\.$/u.test(phrase.text),
    );
    const first = simple.find((phrase) =>
      text.startsWith(phrase.text.toLowerCase().replaceAll('.', '')),
    );
    expect(first).toBeDefined();
  });
});

describe('generate: numbers mode', () => {
  it('takes its digits from sentences that carry them, not from a coin flip', () => {
    for (const language of ['pt-BR', 'en'] as const) {
      const text = generate(config({ language, kind: 'numbers', length: 400 }));
      const bank = phrases(language);
      const numeric = bank.filter((phrase) => phrase.tags.includes('numbers'));
      expect(consumedBy(text, numeric.map((phrase) => phrase.text))).toBe(true);
    }
  });

  it('has a numbers pool big enough for the longest run in both languages', () => {
    for (const bank of [phrases('pt-BR'), phrases('en')]) {
      const numeric = bank.filter((phrase) => phrase.tags.includes('numbers'));
      const budget = numeric.reduce((sum, phrase) => sum + phrase.text.length + 1, 0);
      expect(budget).toBeGreaterThan(360);
    }
  });
});

describe('generate: code mode', () => {
  // Read off the contract rather than listed here: a syntax added to the enum
  // with no snippets behind it fails this file instead of slipping past it.
  const SYNTAXES = SyntaxSchema.options;

  /** The snippet counterpart of the phrase-bank rule: whole units, or nothing. */
  function consumedBySnippets(text: string, pool: readonly Snippet[]): boolean {
    const ordered = [...pool].sort((a, b) => b.code.length - a.code.length);
    let rest = text;
    while (rest.length > 0) {
      const snippet = ordered.find(
        (s) => rest === s.code || rest.startsWith(`${s.code}\n\n`),
      );
      if (!snippet) return false;
      rest = rest.slice(snippet.code.length).replace(/^\n+/, '');
    }
    return true;
  }

  it('is deterministic for the same seed and syntax', () => {
    const one = config({ kind: 'code', syntax: 'rust', length: 300 });
    expect(generate(one)).toBe(generate(one));
  });

  it('reshuffles when only the syntax changes', () => {
    const base = { kind: 'code', length: 300 } as const;
    expect(generate(config({ ...base, syntax: 'rust' }))).not.toBe(
      generate(config({ ...base, syntax: 'go' })),
    );
  });

  it('ignores the human language — Rust is Rust in both', () => {
    const base = { kind: 'code', syntax: 'rust', length: 300 } as const;
    expect(generate(config({ ...base, language: 'pt-BR' }))).toBe(
      generate(config({ ...base, language: 'en' })),
    );
  });

  for (const syntax of SYNTAXES) {
    it(`${syntax}: draws only whole snippets of that syntax`, () => {
      const text = generate(config({ kind: 'code', syntax, length: 400 }));
      const pool = SNIPPETS.filter((snippet) => snippet.syntax === syntax);
      expect(text.length).toBeGreaterThan(0);
      expect(consumedBySnippets(text, pool)).toBe(true);
    });
  }

  it('mix: draws only whole snippets, from anywhere in the bank', () => {
    const text = generate(config({ kind: 'code', syntax: 'mix', length: 600 }));
    expect(consumedBySnippets(text, SNIPPETS)).toBe(true);
  });

  it('treats a missing syntax as mix rather than as an empty pool', () => {
    expect(generate(config({ kind: 'code', syntax: null, length: 200 }))).toBe(
      generate(config({ kind: 'code', syntax: 'mix', length: 200 })),
    );
  });

  it('rejects code stitched from loose lines, which is the point', () => {
    const frankenstein = 'return low\n\nif value > high {\n\ncounts[word]++';
    expect(consumedBySnippets(frankenstein, SNIPPETS)).toBe(false);
  });
});

describe('snippet bank', () => {
  it('has ids unique across every syntax', () => {
    expect(new Set(SNIPPETS.map((snippet) => snippet.id)).size).toBe(SNIPPETS.length);
  });

  it('stores code with no leading or trailing whitespace', () => {
    for (const snippet of SNIPPETS) {
      expect(snippet.code).toBe(snippet.code.trim());
    }
  });

  it('keeps every syntax stocked for the longest run', () => {
    for (const syntax of SyntaxSchema.options) {
      const pool = SNIPPETS.filter((snippet) => snippet.syntax === syntax);
      expect(pool.length).toBeGreaterThanOrEqual(3);
      const budget = pool.reduce((sum, snippet) => sum + snippet.code.length + 2, 0);
      expect(budget).toBeGreaterThan(360);
    }
  });

  it('indents consistently inside each snippet', () => {
    for (const snippet of SNIPPETS) {
      const indents = snippet.code
        .split('\n')
        .map((line) => line.match(/^[\t ]*/)?.[0] ?? '')
        .filter((indent) => indent.length > 0);
      // Go is written with tabs because gofmt is; everything else with spaces.
      // A snippet that mixed the two would put an invisible trap on screen.
      const usesTabs = indents.some((indent) => indent.includes('\t'));
      const usesSpaces = indents.some((indent) => indent.includes(' '));
      expect(usesTabs && usesSpaces).toBe(false);
      expect(usesTabs).toBe(snippet.syntax === 'go');
    }
  });
});

describe('generate: punctuation mode', () => {
  const text = generate(config({ kind: 'punctuation', length: 600 }));
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);

  it('starts every sentence with a capital letter', () => {
    for (const sentence of sentences) {
      expect(sentence.charAt(0)).toBe(sentence.charAt(0).toLocaleUpperCase());
    }
  });

  it('ends every sentence with a terminal mark', () => {
    for (const sentence of sentences) {
      expect(sentence).toMatch(/[.!?]$/);
    }
  });

  it('only draws sentences that actually carry inner punctuation', () => {
    // Contra as frases do banco, não contra as orações do texto. Uma entrada
    // pode trazer duas orações — "Qual é a diferença entre um violino e um
    // piano? Um queima mais tempo." — e a pontuação interna que a qualifica
    // para este modo pode estar justamente na emenda entre elas. Dividir o
    // texto por oração e cobrar vírgula de cada pedaço reprova um sorteio
    // perfeitamente correto.
    const punctuated = phrases('pt-BR')
      .filter((phrase) => /[,;:!?]/.test(phrase.text.slice(0, -1)))
      .map((phrase) => phrase.text);
    expect(consumedBy(text, punctuated)).toBe(true);
  });
});

describe('generate: quote mode', () => {
  it('returns whole sentences, never a fragment', () => {
    const text = generate(config({ kind: 'quote', length: 200 }));
    expect(text).toMatch(/^[A-ZÁÂÃÉÊÍÓÔÕÚÇ]/);
    expect(text).toMatch(/[.!?]$/);
  });

  it('never repeats a phrase within one run', () => {
    const text = generate(config({ kind: 'quote', length: 900 }));
    const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
    expect(new Set(sentences).size).toBe(sentences.length);
  });
});

describe('phrase banks', () => {
  const banks = [
    ['pt-BR', PHRASES_PT_BR],
    ['en', PHRASES_EN],
  ] as const;

  for (const [language, bank] of banks) {
    it(`${language}: every phrase is capitalized and terminated`, () => {
      for (const phrase of bank) {
        expect(phrase.text.charAt(0)).toBe(phrase.text.charAt(0).toLocaleUpperCase());
        expect(phrase.text).toMatch(/[.!?]$/);
      }
    });

    it(`${language}: ids are unique`, () => {
      expect(new Set(bank.map((phrase) => phrase.id)).size).toBe(bank.length);
    });

    it(`${language}: no double spaces or stray whitespace`, () => {
      for (const phrase of bank) {
        expect(phrase.text).toBe(phrase.text.trim());
        expect(phrase.text).not.toMatch(/\s{2,}/);
      }
    });
  }
});

describe('difficultyOf', () => {
  it('stays inside 1..5', () => {
    for (const phrase of [...PHRASES_PT_BR, ...PHRASES_EN]) {
      const level = difficultyOf(phrase.text);
      expect(level).toBeGreaterThanOrEqual(1);
      expect(level).toBeLessThanOrEqual(5);
    }
  });

  it('rates symbol-heavy text above plain prose', () => {
    expect(difficultyOf('const { a, b } = obj; // ok!')).toBeGreaterThan(
      difficultyOf('a casa e a rua sao a mesma'),
    );
  });
});

describe('createRandom', () => {
  it('replays the same sequence for the same seed', () => {
    const draw = (seed: string) => {
      const random = createRandom(seed);
      return [random(), random(), random()];
    };
    expect(draw('a')).toEqual(draw('a'));
    expect(draw('a')).not.toEqual(draw('b'));
  });

  it('stays inside [0, 1)', () => {
    const random = createRandom('bounds');
    for (let i = 0; i < 1_000; i += 1) {
      const value = random();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
  });
});
