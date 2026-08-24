// Builds the phrase banks from the Tatoeba sentence exports.
//
// Tatoeba is the right source for a typing trainer because of what it *is*:
// standalone sentences, written and reviewed by native speakers, one per line.
// A news corpus or a book dump would have needed sentence segmentation first,
// and segmentation is where fragments come from — "he said, and then" is a
// perfectly good half-sentence and a terrible thing to ask somebody to type.
//
//   node scripts/ingest-tatoeba.mjs <dir-with-por.tsv-and-eng.tsv>
//
// Deterministic: the same exports produce the same banks, because the shuffle
// is seeded. Re-running it after a Tatoeba refresh is a reviewable diff rather
// than a wholesale replacement.
//
// Licence: Tatoeba sentences are CC-BY 2.0 FR. See ATTRIBUTION.md — the credit
// is a condition of use, not a courtesy.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) {
  console.error('uso: node scripts/ingest-tatoeba.mjs <dir>');
  process.exit(2);
}

/** Sentence length band, matching what the banks already promise. */
const MIN_LENGTH = 40;
const MAX_LENGTH = 140;

/**
 * How many sentences each pool should end up with.
 *
 * Split by pool rather than as one total because the pools are what a run
 * actually draws from: ten thousand sentences with no commas would leave the
 * punctuation mode exactly as starved as it is today.
 */
const TARGETS = { simple: 3000, punctuated: 2000, numbers: 600 };

/**
 * Quanto de cada pool portuguesa precisa ser digitável num teclado US puro.
 *
 * Um piso global era a primeira tentativa e resolvia a conta sem resolver o
 * problema: ele enchia com o que estivesse à mão, quase tudo da pool `simple`,
 * e deixava pontuação em 28% e números em 23%. Quem digita em português num
 * teclado americano não escolhe "o modo com mais frases" — escolhe o modo que
 * quer treinar, e encontrava um deles cheio e os outros vazios.
 *
 * Por pool, então. Os dois teclados não podem ver literalmente a mesma
 * biblioteca: um US puro não tem dead key para "ç", e entregar a ele uma frase
 * que não consegue terminar é pior do que entregar menos. Mas uma frase sem
 * acento serve nos dois, então este piso não custa **nada** à pool do ABNT2 —
 * ela continua do mesmo tamanho e só muda do que é feita.
 *
 * O que custa é treino de acento, e por isso fica abaixo da metade: um
 * treinador de português que parasse de pedir "ã" teria resolvido a divisão
 * desistindo da língua.
 */
const PT_ASCII_SHARE = 0.45;

/** Characters a sentence may contain. Everything else drops the sentence. */
const ALLOWED = /^[\p{L}\p{M}\p{N} ,.;:!?'-]+$/u;

/**
 * Words that make a sentence a bad thing to hand somebody at random.
 *
 * Politics, religion, war, crime, illness and sex are all out — not because
 * the sentences are wrong, but because a typing drill is not the place to be
 * confronted with them, and a random draw cannot read the room.
 */
const BLOCKED = new RegExp(
  [
    // pt-BR
    'guerra|guerras|matar|matou|morte|morreu|morrer|morto|morta|suic',
    'assassin|estupr|arma|armas|bomba|tiro|tiros|sangue|c[âa]ncer|doen',
    'hospital|prisão|preso|crime|droga|drogas|b[êe]bado|[áa]lcool|cigarro',
    'deus|jesus|igreja|b[íi]blia|reza|rezar|padre|pecado|inferno|diabo',
    'presidente|governo|pol[íi]tic|elei|partido|comunis|fascis|nazi',
    'racis|imigra|refugiad|terroris|viol[êe]nc|ódio|burro|idiota|est[úu]pid',
    'sexo|sexual|nu|nua|puta|prostitut|merda|porra|caralho|inferno',
    'governador|prefeito|senador|deputado|candidat|ministro|c[âa]mara',
    'exército|soldado|batalha|invas|revolu|protesto|greve|imposto',
    // en
    'war|wars|kill|killed|killing|death|died|dead|murder|suicide',
    'rape|gun|guns|bomb|shot|shoot|blood|cancer|disease|illness',
    'hospital|prison|jail|crime|criminal|drug|drugs|drunk|alcohol|cigarette',
    'god|jesus|church|bible|pray|prayer|priest|sin|hell|heaven|devil',
    'president|government|politic|election|party|communist|fascist|nazi',
    'racist|racism|immigrant|refugee|terrorist|violence|hate|stupid|idiot',
    'sex|sexual|naked|whore|prostitut|shit|fuck|damn',
    'governor|mayor|senator|minister|candidate|army|soldier|battle',
    'invasion|revolution|protest|strike|tax|taxes|slave|slavery',
    // Phrasings that carry the same weight without any of the words above:
    // "He made the decision to end his life" got through the first pass.
    'depress|lonely|grief|funeral|grave|end (his|her|my|their) life|dying',
  ].join('|'),
  'iu',
);

/**
 * European Portuguese, which the `por` export mixes in with Brazilian.
 *
 * The bank is pt-BR, and second-person-singular conjugation is the cleanest
 * signal: "preocupas", "queres", "tens" are not how a Brazilian writes, and a
 * typing drill that teaches them is teaching the wrong language to the person
 * who chose Portuguese expecting their own.
 */
const EUROPEAN_PT = new RegExp(
  [
    // Second-person-singular pronouns and possessives.
    '\\b(tu|teu|teus|tua|tuas|contigo)\\b',
    // Second-person-singular verbs, listed rather than matched by suffix: a
    // rule like /\\w+este\\b/ would also swallow "deste", "neste" and "leste",
    // which are ordinary Brazilian words.
    '\\b(est[áa]s|queres|podes|tens|fazes|vais|sabes|dizes|v[êe]s|d[áa]s|' +
      'preocupas|gostas|achas|pensas|falas|moras|trabalhas|precisas|' +
      'conseguires|possas|vou-me|d[áa]-me|diz-me)\\b',
    // Vocabulary that differs outright between the two countries.
    '\\b(comboio|autocarro|telem[óo]vel|ecr[ãa]|pequeno-almo[çc]o|' +
      'frigor[íi]fico|rapariga|autoclismo|sandes|talho|rel[vw]ado)\\b',
    // Spellings the 1990 agreement left different on the two sides.
    '\\b(aspeto|rece[çc][ãa]o|conce[çc][ãa]o|dete[çc][ãa]o|perce[çc][ãa]o|' +
      'contacto|fato de banho|casa de banho)\\b',
    // The joins matter: these are alternatives to each other, not a sequence.
    // Building this with .join('') concatenated the groups instead, which
    // demanded all of them in one sentence and so matched nothing at all.
  ].join('|'),
  'iu',
);

/**
 * Portuguese words that never exist without their accent.
 *
 * Duplicated from validate.ts rather than imported: this script runs before
 * the package is built, and a stale dist would silently let the misspellings
 * through. The validator is the authority — anything that slips past here is
 * caught by `pnpm validate:content` before it can be committed.
 */
const NEVER_UNACCENTED = new Set(
  ('voce voces nao tambem alem portugues ninguem alguem apos atraves musica ' +
    'historia familia memoria codigo ultimo ultima unico unica proximo proxima ' +
    'dificil facil possivel impossivel area tres ate ja entao irmao irma mae ' +
    'pao coracao razao estacao atencao informacao situacao condicao direcao ' +
    'posicao relacao solucao questao versao visao decisao ocasiao cafe ingles ' +
    'frances japones mes seculo automatico rapido solido valido numero metodo ' +
    'periodo oculos onibus lampada camera agua arvore nivel movel aviao ' +
    'caminhao cartao botao limao verao sabao facilmente dificilmente proximos ' +
    'ultimos areas niveis').split(' '),
);

/** English words that mark a sentence as being about a named person. */
const NAME_HINT = /\b(Tom|Mary|John|Jane|Bob|Alice|Ken|Yumi|Taro)\b/;

/** Mulberry32, so a rerun of this script reshuffles nothing. */
function createRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, random) {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function normalize(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const isAscii = (text) => /^[\x20-\x7e]*$/.test(text);

/**
 * Whether a capital letter appears where a new sentence did not begin.
 *
 * This is the filter that makes Tatoeba usable. Its most common sentence shape
 * is "Tom told Mary that…", and a bank full of two names nobody knows reads as
 * machine output no matter how correct each sentence is.
 */
function hasInteriorCapital(text) {
  const words = text.split(' ');
  for (let i = 1; i < words.length; i += 1) {
    const previous = words[i - 1] ?? '';
    if (/[.!?]$/.test(previous)) continue;
    const word = words[i] ?? '';
    const first = word[0] ?? '';
    if (first && first !== first.toLowerCase()) return true;
  }
  return false;
}

function accepts(text, language) {
  if (text.length < MIN_LENGTH || text.length > MAX_LENGTH) return false;
  if (!/[.!?]$/.test(text)) return false;
  if (!ALLOWED.test(text)) return false;
  if (/ {2,}/.test(text) || text !== text.trim()) return false;

  const first = text[0] ?? '';
  if (first === first.toLowerCase()) return false;

  if (hasInteriorCapital(text)) return false;
  if (NAME_HINT.test(text)) return false;
  if (BLOCKED.test(text)) return false;

  // A sentence that is mostly one long word teaches one long word.
  const words = text.split(' ');
  if (words.length < 6) return false;

  if (language === 'en') {
    if (!isAscii(text)) return false;
  } else {
    if (EUROPEAN_PT.test(text)) return false;
    for (const word of normalize(text).split(' ')) {
      if (NEVER_UNACCENTED.has(word)) return false;
    }
  }
  return true;
}

/**
 * How often each word appears lowercase, away from the start of a sentence.
 *
 * This is what separates "Roy aparenta…" from "Acho que…" without shipping a
 * list of every first name on earth. A capitalized first word whose lowercase
 * form is common elsewhere in the corpus is an ordinary word that happened to
 * open a sentence; one that is almost never seen lowercase is a name.
 *
 * The corpus checks itself here, which is the property that matters: a name
 * list would go stale, and Tatoeba's names are not the ones a hand-written
 * list would have guessed anyway.
 */
function lowercaseFrequency(sentences) {
  const counts = new Map();
  for (const text of sentences) {
    const words = text.split(' ');
    for (let i = 1; i < words.length; i += 1) {
      const word = (words[i] ?? '').replace(/[^\p{L}\p{M}]/gu, '');
      if (!word || word[0] !== word[0]?.toLowerCase()) continue;
      counts.set(word.toLowerCase(), (counts.get(word.toLowerCase()) ?? 0) + 1);
    }
  }
  return counts;
}

/** Below this many lowercase sightings, a sentence-initial word is a name. */
const NAME_THRESHOLD = 20;

function opensWithAName(text, frequency) {
  const first = (text.split(' ')[0] ?? '').replace(/[^\p{L}\p{M}]/gu, '');
  if (!first) return true;
  return (frequency.get(first.toLowerCase()) ?? 0) < NAME_THRESHOLD;
}

function poolOf(text) {
  if (/\p{N}/u.test(text)) return 'numbers';
  // Inner punctuation only, matching POOLS.punctuated in generate.ts: a plain
  // question drills no comma, and Tatoeba has tens of thousands of them.
  if (/[,;:!?]/.test(text.slice(0, -1))) return 'punctuated';
  if (/^[\p{L}\p{M} ]+\.$/u.test(text)) return 'simple';
  return null;
}

function jaccard(a, b) {
  let shared = 0;
  for (const word of a) if (b.has(word)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/**
 * Picks sentences that are not near-copies of the ones already picked.
 *
 * The comparison is restricted to candidates that share a word with the one
 * under test, through an inverted index. A full pairwise pass over tens of
 * thousands of candidates is quadratic and pointless: two sentences with no
 * word in common cannot be near-duplicates of each other.
 */
function selectDistinct(candidates, target, taken, index) {
  const chosen = [];
  for (const item of candidates) {
    if (chosen.length >= target) break;
    if (taken.has(item.key)) continue;

    let clash = false;
    const neighbours = new Set();
    for (const word of item.bag) {
      for (const other of index.get(word) ?? []) neighbours.add(other);
    }
    for (const other of neighbours) {
      if (jaccard(item.bag, other) >= 0.6) {
        clash = true;
        break;
      }
    }
    if (clash) continue;

    taken.add(item.key);
    chosen.push(item);
    for (const word of item.bag) {
      const list = index.get(word) ?? [];
      list.push(item.bag);
      index.set(word, list);
    }
  }
  return chosen;
}

function load(file, language) {
  const raw = readFileSync(resolve(source, file), 'utf8');
  const seen = new Set();
  const passed = [];
  let lines = 0;

  for (const line of raw.split('\n')) {
    lines += 1;
    const tab = line.indexOf('\t', line.indexOf('\t') + 1);
    if (tab === -1) continue;
    const text = line.slice(tab + 1).trim();
    if (!accepts(text, language)) continue;

    const key = normalize(text);
    if (seen.has(key)) continue;
    seen.add(key);
    passed.push(text);
  }

  // The name filter needs the whole surviving corpus before it can judge any
  // one sentence, so it runs as a second pass rather than inside `accepts`.
  const frequency = lowercaseFrequency(passed);
  const kept = [];
  let names = 0;

  for (const text of passed) {
    if (opensWithAName(text, frequency)) {
      names += 1;
      continue;
    }
    const pool = poolOf(text);
    if (!pool) continue;
    const key = normalize(text);
    kept.push({
      text,
      key,
      pool,
      bag: new Set(key.split(' ')),
      ascii: isAscii(text),
    });
  }

  return { lines, kept, names };
}

/**
 * Writes the ingested sentences to their own file, beside the curated banks.
 *
 * Additive on purpose. The 197 hand-written sentences carry register tags and
 * a voice that a corpus dump does not have, and overwriting them to gain
 * volume would trade something nobody can rebuild for something that can be
 * regenerated any time by rerunning this script.
 *
 * The `tat-` prefix keeps the two id spaces apart: `pt-001` and `pt-0001` are
 * different strings, which is exactly the kind of near-collision that reads as
 * fine right up until a result is filed against the wrong sentence.
 */
function emit(language, phrases) {
  const prefix = language === 'pt-BR' ? 'tat-pt' : 'tat-en';
  const constant = language === 'pt-BR' ? 'TATOEBA_PT_BR' : 'TATOEBA_EN';
  const file = language === 'pt-BR' ? 'tatoeba-pt-br.ts' : 'tatoeba-en.ts';
  const label =
    language === 'pt-BR'
      ? 'Brazilian Portuguese sentences'
      : 'English sentences';

  const header = `import type { Phrase } from './types';

/**
 * ${label} drawn from the Tatoeba corpus, 40-140 characters each.
 *
 * Generated by scripts/ingest-tatoeba.mjs — do not edit by hand, rerun the
 * script. Every sentence here was written and reviewed by a native speaker on
 * Tatoeba and then put through the filters in that script: length, real final
 * punctuation, no interior capitals (which is what keeps the corpus's endless
 * "Tom told Mary" sentences out), no named people, no politics or religion or
 * violence, and no near-duplicates of each other.
 *
 * Licence: CC-BY 2.0 FR. The credit in ATTRIBUTION.md is a condition of use.
 */
export const ${constant}: readonly Phrase[] = [
`;

  const body = phrases
    .map((item, i) => {
      const id = `${prefix}-${String(i + 1).padStart(4, '0')}`;
      const tags =
        item.pool === 'numbers' ? "['tatoeba', 'numbers']" : "['tatoeba']";
      const text = item.text.replaceAll('\\', '\\\\').replaceAll("'", "\\'");
      return `  { id: '${id}', text: '${text}', tags: ${tags} },`;
    })
    .join('\n');

  const out = resolve(HERE, '../src/data', file);
  writeFileSync(out, `${header}${body}\n];\n`, 'utf8');
  return out;
}

for (const [file, language] of [
  ['por.tsv', 'pt-BR'],
  ['eng.tsv', 'en'],
]) {
  const random = createRandom(0x5e11a1);
  const { lines, kept, names } = load(file, language);
  const shuffled = shuffle(kept, random);

  const taken = new Set();
  const index = new Map();
  const chosen = [];

  for (const [pool, target] of Object.entries(TARGETS)) {
    const candidates = shuffled.filter((item) => item.pool === pool);

    // A cota ASCII de cada pool é servida primeiro, enquanto a pool inteira
    // ainda está disponível. Servi-la por último seria pedir frases sem acento
    // depois de todas elas já terem sido levadas pelo alvo geral.
    if (language === 'pt-BR') {
      const quota = Math.round(target * PT_ASCII_SHARE);
      const ascii = candidates.filter((item) => item.ascii);
      chosen.push(...selectDistinct(ascii, quota, taken, index));
    }

    const already = chosen.filter((item) => item.pool === pool).length;
    chosen.push(
      ...selectDistinct(candidates, Math.max(0, target - already), taken, index),
    );
  }

  const byPool = (pool) => chosen.filter((item) => item.pool === pool).length;
  const out = emit(language, chosen);

  console.log(
    `${language}: ${lines} linhas -> ${kept.length} aceitas (${names} nomes barrados) -> ${chosen.length} escolhidas ` +
      `(simple ${byPool('simple')}, punctuated ${byPool('punctuated')}, ` +
      `numbers ${byPool('numbers')}, ascii ${chosen.filter((i) => i.ascii).length})`,
  );
  console.log(`  -> ${out}`);
}
