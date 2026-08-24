import type {
  Language,
  SessionConfig,
  Syntax,
  SyntaxChoice,
  TextKind,
} from '@perseus/contracts';
import { PHRASES_EN } from './data/phrases-en';
import { PHRASES_PT_BR } from './data/phrases-pt-br';
import { TATOEBA_EN } from './data/tatoeba-en';
import { TATOEBA_PT_BR } from './data/tatoeba-pt-br';
import { SNIPPETS, type Snippet } from './data/snippets';
import type { Phrase } from './data/types';
import { phraseAt, positionOf } from './bag';
import { createRandom, pick, type Random } from './random';
import { reachOf, reaches, type Reach } from './reach';

/**
 * The bank a language draws from: the hand-written sentences first, then the
 * ones ingested from Tatoeba.
 *
 * Concatenated rather than merged into one file so the two keep their separate
 * provenance. The curated sentences carry register tags and a voice; the
 * ingested ones carry volume and can be regenerated at any time by rerunning
 * scripts/ingest-tatoeba.mjs. Losing that distinction would mean never being
 * able to re-ingest without hand-picking the originals back out.
 */
const PHRASES: Record<Language, readonly Phrase[]> = {
  'pt-BR': [...PHRASES_PT_BR, ...TATOEBA_PT_BR],
  en: [...PHRASES_EN, ...TATOEBA_EN],
};

/**
 * A sentence made of nothing but letters, spaces and a full stop.
 *
 * This is what the `words` mode can strip down without damage: no comma to
 * lose, no hyphen to swallow, no digit that only makes sense next to a symbol.
 * Anything else stays out of that pool rather than being mangled into it.
 */
const PLAIN_SENTENCE = /^[\p{L}\p{M} ]+\.$/u;

/**
 * Every text a user types comes out of one of these pools.
 *
 * Split by reach as well as by language, and split once at module load rather
 * than per draw: the banks run to several thousand sentences each, and a filter
 * that ran on every keystroke-sized regeneration would be paying for the same
 * answer over and over.
 */
const POOLS = {
  all: byLanguage((bank) => bank),
  simple: byLanguage((bank) =>
    bank.filter((phrase) => PLAIN_SENTENCE.test(phrase.text)),
  ),
  // Inner punctuation, with the terminal mark cut off first. A sentence whose
  // only punctuation is the question mark that ends it drills nothing this mode
  // exists for — the comma and the semicolon are the whole point, and a bank
  // large enough to have thousands of plain questions in it will happily fill
  // the mode with them if the filter looks at the last character.
  punctuated: byLanguage((bank) =>
    bank.filter((phrase) => /[,;:!?]/.test(phrase.text.slice(0, -1))),
  ),
  numeric: byLanguage((bank) =>
    bank.filter((phrase) => phrase.tags.includes('numbers')),
  ),
} as const;

function byLanguage(
  select: (bank: readonly Phrase[]) => readonly Phrase[],
): Record<Language, Record<Reach, readonly Phrase[]>> {
  return {
    'pt-BR': byReach(select(PHRASES['pt-BR'])),
    en: byReach(select(PHRASES.en)),
  };
}

/**
 * Drops the sentences a keyboard cannot type.
 *
 * A sentence is kept or dropped whole. Rewriting "café" to "cafe" was the
 * obvious alternative and is the wrong one: it puts a misspelling on screen and
 * asks somebody to practise typing it, which is a worse thing to teach than a
 * shorter run. The English banks are pure ASCII, so this costs them nothing.
 */
function byReach(pool: readonly Phrase[]): Record<Reach, readonly Phrase[]> {
  return {
    full: pool,
    ascii: pool.filter((phrase) => reaches('ascii', phrase.text)),
  };
}

/** Snippets grouped once, so a run never filters the whole bank per draw. */
const BY_SYNTAX = SNIPPETS.reduce<Record<string, Snippet[]>>((groups, snippet) => {
  (groups[snippet.syntax] ??= []).push(snippet);
  return groups;
}, {});

export function phrases(language: Language): readonly Phrase[] {
  return PHRASES[language];
}

type ProseKind = Exclude<TextKind, 'code'>;

/**
 * Which pool each prose kind draws from.
 *
 * Written down rather than left implicit in the builders because the seed has
 * to answer the same question the builder does — whether this keyboard narrows
 * this pool — and two places deciding that separately is two places to get it
 * wrong.
 */
const KIND_POOLS: Record<ProseKind, keyof typeof POOLS> = {
  words: 'simple',
  quote: 'all',
  punctuation: 'punctuated',
  numbers: 'numeric',
};

/** Both reaches of the pool this config draws from. Never called for code. */
function poolsFor(config: SessionConfig): Record<Reach, readonly Phrase[]> {
  return POOLS[KIND_POOLS[config.kind as ProseKind]][config.language];
}

/**
 * The reach this run actually draws at.
 *
 * Not simply the keyboard's own reach: a US keyboard narrows nothing in the
 * English banks, which are ASCII from end to end. Reporting 'ascii' there would
 * have put the layout in the seed of a run it cannot change, and an American
 * switching their setting from ABNT2 to US would have watched the English text
 * change for no reason they could see.
 *
 * Equal sizes mean equal pools — 'ascii' is built by filtering 'full', so it is
 * always a subset of it.
 */
function drawnPool(config: SessionConfig): readonly Phrase[] {
  return poolsFor(config)[reachFor(config)];
}

function reachFor(config: SessionConfig): Reach {
  if (reachOf(config.keyboardLayout) === 'full') return 'full';
  const pools = poolsFor(config);
  return pools.ascii.length === pools.full.length ? 'full' : 'ascii';
}

export function snippets(syntax: Syntax): readonly Snippet[] {
  return BY_SYNTAX[syntax] ?? [];
}

/**
 * How much of the bank this run's keyboard can actually reach.
 *
 * Exists so the interface can say what the filter did instead of guessing. A
 * warning that hardcodes "about a fifth" is a warning that quietly starts lying
 * the first time somebody adds sentences to the bank.
 *
 * Code reports its pool whole: every snippet is ASCII, so no keyboard is
 * short of one.
 */
export function reachableShare(config: SessionConfig): {
  available: number;
  total: number;
} {
  if (config.kind === 'code') {
    const choice = config.syntax ?? 'mix';
    const pool = choice === 'mix' ? SNIPPETS : (BY_SYNTAX[choice] ?? []);
    return { available: pool.length, total: pool.length };
  }
  const pools = poolsFor(config);
  return {
    available: pools[reachFor(config)].length,
    total: pools.full.length,
  };
}

/**
 * Builds the text for a run. Deterministic for a given config: the same seed
 * and settings always produce the same characters.
 *
 * Every mode draws whole sentences from the bank. Nothing here concatenates
 * tokens: a stream of unrelated words drills the letters while teaching a
 * rhythm no language has, and the rhythm is most of what typing practice is
 * for. Modes differ in *which* sentences they draw and how much of the
 * punctuation survives — never in whether the text means anything.
 */
export function generate(config: SessionConfig): string {
  return run(config).text;
}

/**
 * How many sentences this run takes out of the bag.
 *
 * The browser needs this to advance its cursor, and it must be the count the
 * draw actually used rather than an estimate: an off-by-one here either skips a
 * sentence nobody sees or repeats one everybody does.
 */
export function drawCount(config: SessionConfig): number {
  return run(config).drawn;
}

function run(config: SessionConfig): Drawn {
  const built = BUILDERS[config.kind](createRandom(seedOf(config)), config);
  return { text: built.text.trim(), drawn: built.drawn };
}

/**
 * The seed string carries exactly the fields the kind actually reads.
 *
 * Code ignores the human language, so the language must not enter its seed:
 * otherwise switching the interface from Portuguese to English would hand a
 * programmer different Rust, which is precisely the two axes leaking into each
 * other that keeping them apart is meant to prevent. Syntax enters it for the
 * mirror reason — without it, Rust and Go would replay one draw order against
 * two different pools.
 *
 * A null syntax normalizes to 'mix' here as well as in the builder, so the two
 * ways of saying "any of them" cannot produce two different texts.
 *
 * The keyboard enters the prose seed as its *reach*, never as its name, and
 * never enters the code one — the snippet bank is pure ASCII, so no keyboard
 * this app offers can fail to type it. A test holds that true.
 */
function seedOf(config: SessionConfig): string {
  if (config.kind === 'code') return `${config.seed}:code:${config.syntax ?? 'mix'}`;
  // Only the bag's *id* shapes the prose shuffle — never the cursor. Folding
  // the cursor in here would reshuffle the pool on every advance, which is
  // sampling with replacement again wearing a bag's clothes.
  const { id } = positionOf(config.seed);
  return `${id}:${config.language}:${config.kind}:${reachFor(config)}`;
}

/** A built text and how many sentences of the bag it consumed. */
type Drawn = { readonly text: string; readonly drawn: number };

type Builder = (random: Random, config: SessionConfig) => Drawn;

const BUILDERS: Record<TextKind, Builder> = {
  // Real sentences with the capitals and the full stops taken off. The drill
  // here is letter reach and rhythm, so Shift and punctuation are out of scope
  // — but the words underneath are still a sentence somebody wrote.
  words: (_random, config) => {
    const run = drawFromBag(config);
    return { text: stripped(run.text), drawn: run.drawn };
  },

  // Whole sentences from the bank, never cut mid-thought.
  quote: (_random, config) => drawFromBag(config),

  // Also real sentences, but only the ones carrying inner punctuation. Stitching
  // random words together and sprinkling commas on top would drill the symbols
  // while teaching a rhythm that no real sentence has.
  punctuation: (_random, config) => drawFromBag(config),

  // Sentences that carry numbers of their own — a delay of eighteen minutes, a
  // bill in reais. Injecting digits into a word stream on a coin flip drills
  // the top row out of any context, which is the one thing that makes the top
  // row hard: you never know it is coming.
  numbers: (_random, config) => drawFromBag(config),

  // Whole functions, indentation and all. `language` is ignored here on
  // purpose: Rust reads the same in São Paulo and in Seattle, and folding the
  // two axes together would have meant a corpus per pair of them.
  //
  // `keyboardLayout` is ignored for a different reason: every snippet is ASCII,
  // so no layout is short of a character here. What differs between them is how
  // far the fingers travel to reach a brace, and that is the drill, not a
  // reason to hand somebody a smaller bank.
  code: (random, config) => ({
    text: drawCode(random, config.length, config.syntax ?? 'mix'),
    // Code has no bag: the snippet pool is 66 entries and a run takes most of
    // them, so there is nothing to deal out without repeating. Its variety
    // still comes from the seed, which the cursor changes on every new run.
    drawn: 0,
  }),
};

/**
 * Pulls whole snippets until the budget is met, never repeating one.
 *
 * Snippets are joined by a blank line rather than a space: two functions run
 * together on one line is not code anybody has read, and the blank line is
 * itself two newlines worth of typing that a real file would contain.
 */
function drawCode(random: Random, target: number, choice: SyntaxChoice): string {
  const pool =
    choice === 'mix'
      ? SNIPPETS
      : (BY_SYNTAX[choice] ?? []);

  const chosen: string[] = [];
  const used = new Set<string>();
  let length = 0;

  while (length < target && used.size < pool.length) {
    const snippet = pick(random, pool);
    if (used.has(snippet.id)) continue;
    used.add(snippet.id);
    chosen.push(snippet.code);
    length += snippet.code.length + 2;
  }
  return chosen.join('\n\n');
}

/**
 * Deals sentences off the top of this run's bag until the budget is met.
 *
 * The bag is what stops a sentence coming back before the pool has been gone
 * through. The old draw picked at random with a `used` set, which kept a run
 * from repeating itself but remembered nothing between runs: every new seed
 * sampled the whole pool again, so two consecutive runs shared a sentence about
 * a fifth of the time on the bank as it then was.
 *
 * Nothing is cut short at the seam. A run starting near the end of a pass rolls
 * into the next one, reshuffled, rather than ending early — see `phraseAt`.
 */
function drawFromBag(config: SessionConfig): Drawn {
  const pool = drawnPool(config);
  if (pool.length === 0) return { text: '', drawn: 0 };

  const base = seedOf(config);
  const { cursor } = positionOf(config.seed);

  const chosen: string[] = [];
  let length = 0;
  let drawn = 0;

  // Never more than a whole pass: past that a run would start repeating itself,
  // which is the one thing the old `used` set did get right.
  while (length < config.length && drawn < pool.length) {
    const phrase = phraseAt(pool, base, cursor + drawn);
    chosen.push(phrase.text);
    length += phrase.text.length + 1;
    drawn += 1;
  }

  return { text: chosen.join(' '), drawn };
}

/**
 * Lowercases and drops the full stops.
 *
 * Safe only on the `simple` pool, whose sentences hold no punctuation worth
 * keeping — run this over a comma and you would silently change what the
 * sentence says.
 */
function stripped(text: string): string {
  return text.toLowerCase().replaceAll('.', '');
}
