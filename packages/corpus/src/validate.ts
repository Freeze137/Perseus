import { PHRASES_EN } from './data/phrases-en';
import { PHRASES_PT_BR } from './data/phrases-pt-br';
import type { Phrase } from './data/types';

/**
 * A problem found in a bank, named precisely enough to fix without hunting.
 *
 * `rule` is the machine-readable half and `detail` the human one: a report that
 * only said "bad phrase" would send somebody back to re-derive what the checker
 * already knew.
 */
export type Finding = {
  readonly bank: string;
  readonly id: string;
  readonly rule: string;
  readonly detail: string;
};

/**
 * A word that is spelled correctly either way, so only a reader can say which
 * one this sentence meant.
 *
 * Kept apart from `Finding` because the two demand opposite handling: an error
 * is fixed, an ambiguity is *asked about*. Auto-correcting "esta" to "está"
 * would silently rewrite sentences that were already right, which is a worse
 * failure than leaving them alone — it changes meaning while reporting success.
 */
export type Review = {
  readonly bank: string;
  readonly id: string;
  readonly word: string;
  readonly text: string;
};

export type Report = {
  readonly errors: readonly Finding[];
  readonly review: readonly Review[];
};

/**
 * Portuguese words that do not exist without their accent.
 *
 * Every entry is the *misspelling* — the bare form. Seeing one as a whole word
 * is proof of a dropped accent, with no sentence in which it could have been
 * intended.
 *
 * Words whose bare form is also a real word are deliberately absent; they live
 * in AMBIGUOUS instead. "ideia" is absent from both: it has carried no accent
 * since the 1990 orthographic agreement, and a list that demanded one would
 * have flagged correct spelling as an error.
 */
const NEVER_UNACCENTED = new Set([
  'voce', 'voces', 'nao', 'tambem', 'alem', 'portugues', 'ninguem', 'alguem',
  'apos', 'atraves', 'musica', 'historia', 'familia', 'memoria', 'codigo',
  'ultimo', 'ultima', 'unico', 'unica', 'proximo', 'proxima', 'dificil',
  'facil', 'possivel', 'impossivel', 'area', 'tres', 'ate', 'ja',
  'entao', 'irmao', 'irma', 'mae', 'pao', 'coracao', 'razao', 'estacao',
  'atencao', 'informacao', 'situacao', 'condicao', 'direcao', 'posicao',
  'relacao', 'solucao', 'questao', 'versao', 'visao', 'decisao', 'ocasiao',
  'cafe', 'ingles', 'frances', 'japones', 'mes', 'seculo', 'automatico',
  'rapido', 'solido', 'valido', 'numero', 'metodo', 'periodo', 'oculos',
  'onibus', 'lampada', 'camera', 'agua', 'arvore', 'nivel', 'movel',
  'aviao', 'caminhao', 'cartao', 'botao', 'limao', 'verao', 'sabao',
  'facilmente', 'dificilmente', 'proximos', 'ultimos', 'areas', 'niveis',
]);

/**
 * Words whose accented and bare forms are both real Portuguese.
 *
 * Reported for a human to read, never corrected. "sabia" (knew), "sabiá" (a
 * bird) and "sábia" (wise) are three different words that no checker can tell
 * apart without understanding the sentence.
 *
 * "e"/"é" and "por"/"pôr" are the most common accent errors in Portuguese and
 * are still absent on purpose: they appear in nearly every sentence, so listing
 * them would bury the twenty cases worth reading under two hundred that are
 * not. Their failure mode also breaks the grammar of the sentence around them,
 * which the read-through in 1.2 catches.
 */
const AMBIGUOUS = new Set([
  'esta', 'estas', 'pratica', 'praticas', 'secretaria', 'duvida', 'sabia',
  'avo', 'pode', 'critica', 'fabrica', 'habito', 'publico', 'medico',
  'pratico', 'liquido', 'analise', 'especifica', 'transito', 'seria',
  'continuo', 'intimo', 'proposito',
]);

/** Unambiguous markers that a sentence strayed into the wrong bank. */
const PT_MARKERS = new Set([
  'você', 'não', 'também', 'então', 'porque', 'quando', 'sempre', 'ainda',
  'depois', 'muito', 'pouco', 'cada', 'uma',
]);
const EN_MARKERS = new Set([
  'the', 'and', 'with', 'that', 'this', 'from', 'they', 'have', 'been',
  'which', 'their', 'would', 'about', 'there',
]);

/** Mojibake: UTF-8 read as Latin-1, which is how a bad paste arrives. */
const MOJIBAKE = /Ã.|Â.|â€/u;
/** Control characters and the invisibles that survive a copy from a browser. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u00ad\u200b-\u200d\ufeff]/u;
/** Typographic quotes. The banks are standardized on straight ones. */
const CURLY_QUOTES = /[‘’“”]/u;
const EMOJI = /\p{Extended_Pictographic}/u;

/** The band the Portuguese bank's own docstring promises: 40–140 characters. */
const MIN_LENGTH = 40;
const MAX_LENGTH = 140;

/** Above this share of shared words, two sentences are the same sentence. */
const NEAR_DUPLICATE = 0.8;

/** Lowercased, unaccented, stripped of punctuation — for comparing meaning. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Words as written, accents intact. */
function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
}

function jaccard(a: readonly string[], b: readonly string[]): number {
  const left = new Set(a);
  const right = new Set(b);
  let shared = 0;
  for (const word of left) if (right.has(word)) shared += 1;
  const union = left.size + right.size - shared;
  return union === 0 ? 0 : shared / union;
}

function checkPhrase(
  language: 'pt-BR' | 'en',
  phrase: Phrase,
  push: (rule: string, detail: string) => void,
): void {
  const { text } = phrase;

  if (text.trim().length === 0) {
    push('empty', 'no text at all');
    return;
  }
  if (text !== text.trim()) push('whitespace', 'leading or trailing space');
  if (/ {2,}/.test(text)) push('whitespace', 'double space');
  if (/[\n\r\t]/.test(text)) push('whitespace', 'line break or tab');
  if (INVISIBLE.test(text)) push('invisible', 'control or zero-width character');
  if (MOJIBAKE.test(text)) push('mojibake', 'UTF-8 decoded as Latin-1');
  if (EMOJI.test(text)) push('emoji', 'emoji in a typing target');
  if (CURLY_QUOTES.test(text))
    push('quotes', 'typographic quote; the banks use straight ones');

  const first = text[0] ?? '';
  if (first !== first.toUpperCase())
    push('capitalization', `starts lowercase: "${text.slice(0, 24)}"`);
  if (!/[.!?]$/.test(text))
    push('punctuation', `no final punctuation: "${text.slice(-24)}"`);

  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH)
    push(
      'length',
      `${text.length} characters, outside ${MIN_LENGTH}-${MAX_LENGTH}`,
    );

  if (phrase.tags.length === 0) push('tags', 'no register tag');

  const written = words(text);

  if (language === 'pt-BR') {
    // NEVER_UNACCENTED holds bare spellings, so a raw word that matches one is
    // a word that lost its accent. "café" never matches; "cafe" always does.
    for (const word of written) {
      if (NEVER_UNACCENTED.has(word))
        push('accent', `"${word}" never exists without its accent`);
      if (EN_MARKERS.has(word))
        push('language', `English word "${word}" in the Portuguese bank`);
    }
    return;
  }

  if (/\p{M}/u.test(text.normalize('NFD')))
    push('accent', 'accented character in the English bank');
  for (const word of written) {
    if (PT_MARKERS.has(word))
      push('language', `Portuguese word "${word}" in the English bank`);
  }
}

/**
 * Reads both banks and reports everything wrong with them.
 *
 * Pure: it returns findings rather than printing or throwing, so the same code
 * backs the test that guards the banks in CI and any script that writes a
 * report out of them.
 */
export function validate(): Report {
  return validateBanks([
    {
      bank: 'phrases-pt-br',
      language: 'pt-BR' as const,
      phrases: PHRASES_PT_BR,
    },
    { bank: 'phrases-en', language: 'en' as const, phrases: PHRASES_EN },
  ]);
}

/** One bank as the checker sees it: a name, a language, and its sentences. */
export type Bank = {
  readonly bank: string;
  readonly language: 'pt-BR' | 'en';
  readonly phrases: readonly Phrase[];
};

/**
 * The checker itself, over whatever banks it is handed.
 *
 * Split out from `validate` so the tests can feed it sentences that are broken
 * on purpose. A checker that has only ever been run against clean input has not
 * been shown to detect anything — "zero errors" and "no working rules" produce
 * exactly the same output.
 */
export function validateBanks(banks: readonly Bank[]): Report {
  const errors: Finding[] = [];
  const review: Review[] = [];

  for (const { bank, language, phrases } of banks) {
    const seenIds = new Set<string>();
    const seenText = new Map<string, string>();
    const compared: { id: string; bag: string[] }[] = [];

    for (const phrase of phrases) {
      const push = (rule: string, detail: string): void => {
        errors.push({ bank, id: phrase.id, rule, detail });
      };

      if (seenIds.has(phrase.id)) push('id', 'duplicate id');
      seenIds.add(phrase.id);

      checkPhrase(language, phrase, push);

      const key = normalize(phrase.text);
      const twin = seenText.get(key);
      if (twin) push('duplicate', `same sentence as ${twin}`);
      else seenText.set(key, phrase.id);

      const bag = key.split(' ').filter(Boolean);
      for (const other of compared) {
        const score = jaccard(bag, other.bag);
        if (score >= NEAR_DUPLICATE)
          push(
            'near-duplicate',
            `${Math.round(score * 100)}% of the words of ${other.id}`,
          );
      }
      compared.push({ id: phrase.id, bag });

      if (language === 'pt-BR') {
        for (const word of new Set(words(phrase.text))) {
          if (AMBIGUOUS.has(word))
            review.push({ bank, id: phrase.id, word, text: phrase.text });
        }
      }
    }
  }

  return { errors, review };
}

/** The ambiguous cases as the Markdown the manual review reads. */
export function reviewMarkdown(review: readonly Review[]): string {
  const lines = [
    '# Casos ambíguos para revisão manual',
    '',
    'Palavras corretas com e sem acento. O validador não decide por conta',
    'própria: só a frase diz qual das duas era a intenção.',
    '',
    `Total: ${review.length}`,
    '',
    '| Banco | Id | Palavra | Frase |',
    '| --- | --- | --- | --- |',
  ];
  for (const item of review) {
    lines.push(
      `| ${item.bank} | ${item.id} | \`${item.word}\` | ${item.text} |`,
    );
  }
  return `${lines.join('\n')}\n`;
}
