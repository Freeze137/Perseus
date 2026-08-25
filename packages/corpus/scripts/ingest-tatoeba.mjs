// Monta os bancos de frases a partir dos exports de frases do Tatoeba.
//
// O Tatoeba é a fonte certa pra um treinador de digitação por causa do que ele
// *é*: frases soltas, escritas e revisadas por falantes nativos, uma por linha.
// Um corpus de notícia ou um despejo de livro precisaria de segmentação antes,
// e segmentação é de onde vêm os fragmentos — "ele disse, e então" é uma
// meia-frase perfeitamente boa e uma coisa péssima de pedir pra alguém digitar.
//
//   node scripts/ingest-tatoeba.mjs <dir-with-por.tsv-and-eng.tsv>
//
// Determinístico: os mesmos exports produzem os mesmos bancos, porque o
// embaralhamento tem semente. Rodar de novo depois de uma atualização do Tatoeba
// dá um diff revisável em vez de uma substituição inteira.
//
// Licença: as frases do Tatoeba são CC-BY 2.0 FR. Ver ATTRIBUTION.md — o crédito
// é condição de uso, não cortesia.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const source = process.argv[2];
if (!source) {
  console.error('uso: node scripts/ingest-tatoeba.mjs <dir>');
  process.exit(2);
}

/** Faixa de tamanho da frase, batendo com o que os bancos já prometem. */
const MIN_LENGTH = 40;
const MAX_LENGTH = 140;

/**
 * Com quantas frases cada pool deve terminar.
 *
 * Dividido por pool em vez de um total só porque é das pools que uma corrida
 * de fato sorteia: dez mil frases sem vírgula deixariam o modo de pontuação
 * exatamente tão faminto quanto ele é hoje.
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

/** Caracteres que uma frase pode conter. Qualquer outro derruba a frase. */
const ALLOWED = /^[\p{L}\p{M}\p{N} ,.;:!?'-]+$/u;

/**
 * Palavras que fazem de uma frase coisa ruim de entregar a alguém no sorteio.
 *
 * Política, religião, guerra, crime, doença e sexo ficam de fora — não porque
 * as frases estejam erradas, mas porque um treino de digitação não é lugar de
 * ser confrontado com elas, e um sorteio aleatório não lê o ambiente.
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
    // Construções que carregam o mesmo peso sem nenhuma das palavras acima:
    // "He made the decision to end his life" passou na primeira peneira.
    'depress|lonely|grief|funeral|grave|end (his|her|my|their) life|dying',
  ].join('|'),
  'iu',
);

/**
 * Português europeu, que o export `por` mistura com o brasileiro.
 *
 * O banco é pt-BR, e a conjugação de segunda pessoa do singular é o sinal mais
 * limpo: "preocupas", "queres", "tens" não é como um brasileiro escreve, e um
 * treino de digitação que ensina isso está ensinando a língua errada pra quem
 * escolheu português esperando a própria.
 */
const EUROPEAN_PT = new RegExp(
  [
    // Pronomes e possessivos de segunda pessoa do singular.
    '\\b(tu|teu|teus|tua|tuas|contigo)\\b',
    // Verbos de segunda pessoa do singular, listados em vez de casados por
    // sufixo: uma regra tipo /\\w+este\\b/ engoliria também "deste", "neste" e
    // "leste", que são palavras brasileiras comuns.
    '\\b(est[áa]s|queres|podes|tens|fazes|vais|sabes|dizes|v[êe]s|d[áa]s|' +
      'preocupas|gostas|achas|pensas|falas|moras|trabalhas|precisas|' +
      'conseguires|possas|vou-me|d[áa]-me|diz-me)\\b',
    // Vocabulário que difere de vez entre os dois países.
    '\\b(comboio|autocarro|telem[óo]vel|ecr[ãa]|pequeno-almo[çc]o|' +
      'frigor[íi]fico|rapariga|autoclismo|sandes|talho|rel[vw]ado)\\b',
    // Grafias que o acordo de 1990 deixou diferentes dos dois lados.
    '\\b(aspeto|rece[çc][ãa]o|conce[çc][ãa]o|dete[çc][ãa]o|perce[çc][ãa]o|' +
      'contacto|fato de banho|casa de banho)\\b',
    // Consoantes mudas que o Brasil não escreve. Cuidado com a direção: o
    // brasileiro é quem *mantém* o c em "aspecto" e "espectador", e quem o
    // perde em "facto" e "reflecte". Listar o par errado apagaria do banco a
    // grafia certa em vez da errada.
    '\\b(factos?|actos?|[óo]ptim[oa]s?|object\\w*|direct[oa]s?|' +
      'correct[oa]s?|exact[oa]s?|activ[oa]s?|adopt\\w*|baptis\\w*|' +
      'Egipto|h[úu]mid[oa]s?|connosco|reflect\\w*|arquitect\\w*|' +
      'electr[óo]nic\\w*|espect[áa]cul\\w*|ac[çc][ãa]o|sec[çc][ãa]o|' +
      'infec[çc]\\w*|selec[çc]\\w*|colec[çc]\\w*|direc[çc][ãa]o)\\b',
    // Os joins importam: estes são alternativas entre si, não uma sequência.
    // Montar isto com .join('') concatenava os grupos, o que exigia todos eles
    // numa frase só e portanto não casava com nada.
  ].join('|'),
  'iu',
);

/**
 * Palavras que nunca existem em português sem o acento.
 *
 * Duplicadas do validate.ts em vez de importadas: este script roda antes de o
 * pacote ser construído, e um dist velho deixaria as grafias erradas passarem
 * caladas. A autoridade é o validador — o que escapar daqui é pego pelo
 * `pnpm validate:content` antes de poder ser commitado.
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

/**
 * Inglês vazado na frase portuguesa.
 *
 * A mesma lista do validador. Casos como "rock and roll" são empréstimo
 * legítimo, mas na prática a frase que os traz costuma vir torta por outros
 * motivos — a que motivou esta regra dizia "na musical ocidental".
 */
const ENGLISH_IN_PT =
  /\b(the|and|with|that|this|from|they|have|been|which|their|would|about|there)\b/i;

/** Palavras em inglês que marcam a frase como sendo sobre uma pessoa com nome. */
const NAME_HINT = /\b(Tom|Mary|John|Jane|Bob|Alice|Ken|Yumi|Taro)\b/;

/** Mulberry32, pra rodar este script de novo não reembaralhar nada. */
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
 * Se aparece maiúscula onde não começou frase nova.
 *
 * É este o filtro que torna o Tatoeba usável. O formato de frase mais comum
 * dele é "Tom told Mary that…", e um banco cheio de dois nomes que ninguém
 * conhece lê como saída de máquina por mais correta que cada frase esteja.
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

  // Frase que é quase toda uma palavra longa ensina uma palavra longa.
  const words = text.split(' ');
  if (words.length < 6) return false;

  if (language === 'en') {
    if (!isAscii(text)) return false;
  } else {
    if (EUROPEAN_PT.test(text)) return false;
    // O mesmo que o validador cobra. Os dois precisam concordar: uma frase que
    // o ingestor aceita e o validador recusa quebra a suíte no próximo
    // re-sorteio, e quem for consertar não terá nem o texto na mão.
    if (ENGLISH_IN_PT.test(text)) return false;
    for (const word of normalize(text).split(' ')) {
      if (NEVER_UNACCENTED.has(word)) return false;
    }
  }
  return true;
}

/**
 * Com que frequência cada palavra aparece em minúscula, longe do começo da frase.
 *
 * É isto que separa "Roy aparenta…" de "Acho que…" sem embarcar uma lista de
 * todo primeiro nome do mundo. Primeira palavra com maiúscula cuja forma em
 * minúscula é comum no resto do corpus é palavra comum que por acaso abriu a
 * frase; a que quase nunca é vista em minúscula é nome.
 *
 * O corpus se confere sozinho aqui, e é essa a propriedade que importa: lista
 * de nome envelheceria, e os nomes do Tatoeba não são os que uma lista escrita
 * à mão teria adivinhado de qualquer jeito.
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
  // Só pontuação interna, batendo com POOLS.punctuated no generate.ts: uma
  // pergunta simples não treina vírgula nenhuma, e o Tatoeba tem dezenas de
  // milhares delas.
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
 * Escolhe frases que não são quase-cópias das já escolhidas.
 *
 * A comparação é restrita a candidatas que dividem uma palavra com a que está
 * sendo testada, por um índice invertido. Uma passada par a par completa sobre
 * dezenas de milhares de candidatas é quadrática e inútil: duas frases sem
 * palavra em comum não podem ser quase-duplicatas uma da outra.
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

  // O filtro de nome precisa do corpus sobrevivente inteiro antes de julgar
  // qualquer frase, então roda numa segunda passada em vez de dentro do
  // `accepts`.
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
 * Escreve as frases importadas num arquivo próprio, ao lado dos bancos curados.
 *
 * Aditivo de propósito. As 197 frases escritas à mão carregam tags de registro
 * e uma voz que despejo de corpus não tem, e sobrescrevê-las pra ganhar volume
 * trocaria algo que ninguém reconstrói por algo que dá pra regerar a qualquer
 * momento rodando este script.
 *
 * O prefixo `tat-` mantém os dois espaços de id separados: `pt-001` e `pt-0001`
 * são strings diferentes, que é exatamente o tipo de quase-colisão que parece
 * bem até um resultado ser arquivado contra a frase errada.
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
 * ${label} tiradas do corpus Tatoeba, 40-140 caracteres cada.
 *
 * Gerado por scripts/ingest-tatoeba.mjs — não edite na mão, rode o script de
 * novo. Toda frase daqui foi escrita e revisada por falante nativo no Tatoeba e
 * depois passou pelos filtros daquele script: tamanho, pontuação final de
 * verdade, sem maiúscula no meio (que é o que segura as infinitas frases "Tom
 * disse a Mary" do corpus), sem nome de pessoa, sem política, religião ou
 * violência, e sem quase-duplicata entre si.
 *
 * Licença: CC-BY 2.0 FR. O crédito no ATTRIBUTION.md é condição de uso.
 */
export const ${constant}: readonly Phrase[] = [
`;

  const body = phrases
    .map((item, i) => {
      const id = `${prefix}-${String(i + 1).padStart(4, '0')}`;
      const tags =
        item.pool === 'numbers' ? "['tatoeba', 'numbers']" : "['tatoeba']";
      const text = item.text.replaceAll('\\', '\\').replaceAll("'", "\\'");
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
