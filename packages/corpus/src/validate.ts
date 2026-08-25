import { PHRASES_EN } from './data/phrases-en';
import { PHRASES_PT_BR } from './data/phrases-pt-br';
import { TATOEBA_EN } from './data/tatoeba-en';
import { TATOEBA_PT_BR } from './data/tatoeba-pt-br';
import type { Phrase } from './data/types';

/**
 * Um problema achado num banco, nomeado com precisão suficiente pra consertar
 * sem caçar.
 *
 * `rule` é a metade que a máquina lê e `detail` a que a pessoa lê. Relatório
 * que só dissesse "frase ruim" mandaria alguém redescobrir o que o validador
 * já sabia.
 */
export type Finding = {
  readonly bank: string;
  readonly id: string;
  readonly rule: string;
  readonly detail: string;
};

/**
 * Palavra que está certa dos dois jeitos, então só quem lê sabe qual a frase
 * quis dizer.
 *
 * Separado de `Finding` porque os dois pedem tratamento oposto: erro se
 * conserta, ambiguidade se *pergunta*. Corrigir "esta" pra "está" sozinho
 * reescreveria calado frases que já estavam certas, o que é pior que deixar
 * quieto — muda o sentido enquanto reporta sucesso.
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
 * Palavras que não existem em português sem o acento.
 *
 * Toda entrada é a *grafia errada*, a forma pelada. Ver uma delas como palavra
 * inteira prova acento caído: não existe frase em que fosse intencional.
 *
 * Palavras cuja forma pelada também é palavra de verdade ficam de fora de
 * propósito; moram em AMBIGUOUS. "ideia" não está em nenhuma das duas: não leva
 * acento desde o acordo de 1990, e uma lista que exigisse um marcaria a grafia
 * certa como erro.
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
 * Palavras cuja forma com e sem acento são as duas português de verdade.
 *
 * Reportadas pra alguém ler, nunca corrigidas. "sabia", "sabiá" e "sábia" são
 * três palavras diferentes que validador nenhum separa sem entender a frase.
 *
 * "e"/"é" e "por"/"pôr" são os erros de acento mais comuns do português e mesmo
 * assim ficam de fora de propósito: aparecem em quase toda frase, então listá-las
 * enterraria os vinte casos que valem leitura embaixo de duzentos que não valem.
 * O jeito que elas quebram também estraga a gramática em volta, e a leitura da
 * 1.2 pega isso.
 */
const AMBIGUOUS = new Set([
  'esta', 'estas', 'pratica', 'praticas', 'secretaria', 'duvida', 'sabia',
  'avo', 'pode', 'critica', 'fabrica', 'habito', 'publico', 'medico',
  'pratico', 'liquido', 'analise', 'especifica', 'transito', 'seria',
  'continuo', 'intimo', 'proposito',
]);

/**
 * Grafias europeias que o Brasil não escreve.
 *
 * Só as consoantes mudas, e só na direção certa: o brasileiro é quem *mantém*
 * o c em "aspecto" e "espectador", e quem o perde em "facto" e "reflecte".
 * Listar o par errado apagaria do banco a grafia correta em vez da errada, que
 * é o pior desfecho possível para uma regra escrita para melhorar o português.
 *
 * O ingestor já filtra isto, mas ele roda uma vez e este validador roda em toda
 * mudança — inclusive numa frase acrescentada à mão, que o ingestor nunca vê.
 */
const EUROPEAN_SPELLING =
  /\b(factos?|actos?|[óo]ptim[oa]s?|object[oa]s?|direct[oa]s?|correct[oa]s?|exact[oa]s?|activ[oa]s?|adopt\w*|baptis\w*|Egipto|h[úu]mid[oa]s?|connosco|reflect\w*|arquitect\w*|electr[óo]nic\w*|espect[áa]cul\w*|ac[çc][ãa]o|sec[çc][ãa]o|comboio|autocarro|telem[óo]vel|rapariga)\b/iu;

/** Marcas inequívocas de que a frase foi parar no banco errado. */
const PT_MARKERS = new Set([
  'você', 'não', 'também', 'então', 'porque', 'quando', 'sempre', 'ainda',
  'depois', 'muito', 'pouco', 'cada', 'uma',
]);
const EN_MARKERS = new Set([
  'the', 'and', 'with', 'that', 'this', 'from', 'they', 'have', 'been',
  'which', 'their', 'would', 'about', 'there',
]);

/** Mojibake: UTF-8 lido como Latin-1, que é como chega um colar mal feito. */
const MOJIBAKE = /Ã.|Â.|â€/u;
/** Caracteres de controle e os invisíveis que sobrevivem a um copiar do browser. */
const INVISIBLE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u00ad\u200b-\u200d\ufeff]/u;
/** Aspas tipográficas. Os bancos são padronizados nas retas. */
const CURLY_QUOTES = /[‘’“”]/u;
const EMOJI = /\p{Extended_Pictographic}/u;

/** A faixa que a própria docstring do banco em português promete: 40–140 caracteres. */
const MIN_LENGTH = 40;
const MAX_LENGTH = 140;

/** Acima desta fatia de palavras em comum, duas frases são a mesma frase. */
const NEAR_DUPLICATE = 0.8;

/** Minúscula, sem acento, sem pontuação — pra comparar sentido. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Palavras como escritas, acento intacto. */
function words(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{M}]+/gu) ?? [];
}

/** Em quantas frases do banco cada palavra aparece. */
function documentFrequency(phrases: readonly Phrase[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const phrase of phrases) {
    for (const word of new Set(normalize(phrase.text).split(' '))) {
      if (word) counts.set(word, (counts.get(word) ?? 0) + 1);
    }
  }
  return counts;
}

/** Sob quantas das palavras mais raras da frase ela é indexada. */
const INDEX_WIDTH = 3;

function rarest(
  bag: readonly string[],
  frequency: Map<string, number>,
): string[] {
  return [...new Set(bag)]
    .sort(
      (a, b) => (frequency.get(a) ?? 0) - (frequency.get(b) ?? 0) || (a < b ? -1 : 1),
    )
    .slice(0, INDEX_WIDTH);
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
    // NEVER_UNACCENTED guarda grafia pelada, então palavra crua que bate com
    // uma delas é palavra que perdeu o acento. "café" nunca bate; "cafe" sempre.
    const european = EUROPEAN_SPELLING.exec(text);
    if (european)
      push('spelling', `"${european[0]}" is European Portuguese, not Brazilian`);

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
 * Lê os dois bancos e reporta tudo que está errado neles.
 *
 * Pura: devolve achados em vez de imprimir ou lançar, então o mesmo código
 * serve o teste que guarda os bancos no CI e qualquer script que escreva um
 * relatório a partir deles.
 */
export function validate(): Report {
  return validateBanks([
    {
      bank: 'phrases-pt-br',
      language: 'pt-BR' as const,
      phrases: PHRASES_PT_BR,
    },
    { bank: 'phrases-en', language: 'en' as const, phrases: PHRASES_EN },
    // Os bancos importados passam exatamente pelas mesmas regras dos escritos.
    // Foram selecionados por máquina, o que é motivo pra checar mais e não pra
    // confiar: os filtros do ingest-tatoeba.mjs e as regras daqui foram escritos
    // separados, e é aqui que os dois são obrigados a concordar.
    {
      bank: 'tatoeba-pt-br',
      language: 'pt-BR' as const,
      phrases: TATOEBA_PT_BR,
    },
    { bank: 'tatoeba-en', language: 'en' as const, phrases: TATOEBA_EN },
  ]);
}

/** Um banco como o validador vê: nome, língua e as frases. */
export type Bank = {
  readonly bank: string;
  readonly language: 'pt-BR' | 'en';
  readonly phrases: readonly Phrase[];
};

/**
 * O validador em si, sobre quaisquer bancos que recebe.
 *
 * Separado do `validate` pros testes conseguirem passar frases quebradas de
 * propósito. Validador que só rodou contra entrada limpa não provou detectar
 * nada — "zero erros" e "nenhuma regra funcionando" dão exatamente a mesma
 * saída.
 */
export function validateBanks(banks: readonly Bank[]): Report {
  const errors: Finding[] = [];
  const review: Review[] = [];

  for (const { bank, language, phrases } of banks) {
    const seenIds = new Set<string>();
    const seenText = new Map<string, string>();
    /** Palavra -> ids das frases indexadas nela, pra varredura de quase-duplicata. */
    const index = new Map<string, string[]>();
    const bags = new Map<string, string[]>();
    const frequency = documentFrequency(phrases);

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

      // Quase-duplicata só é procurada entre frases que dividem uma das
      // palavras mais raras desta. Comparar todas com todas é quadrático —
      // vinte e cinco milhões de interseções com cinco mil por banco — e
      // indexar por toda palavra quase não ajuda, porque "de" e "que" ligam
      // quase o corpus inteiro a quase o corpus inteiro.
      //
      // Palavra rara é a que discrimina: duas frases parecidas o bastante pra
      // serem quase-cópias dividem o vocabulário incomum, não só os artigos.
      const bag = key.split(' ').filter(Boolean);
      const neighbours = new Set<string>();
      for (const word of rarest(bag, frequency)) {
        for (const id of index.get(word) ?? []) neighbours.add(id);
      }
      for (const id of neighbours) {
        const other = bags.get(id);
        if (!other) continue;
        const score = jaccard(bag, other);
        if (score >= NEAR_DUPLICATE)
          push(
            'near-duplicate',
            `${Math.round(score * 100)}% of the words of ${id}`,
          );
      }
      bags.set(phrase.id, bag);
      for (const word of rarest(bag, frequency)) {
        const list = index.get(word) ?? [];
        list.push(phrase.id);
        index.set(word, list);
      }

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

/** Os casos ambíguos como o Markdown que a revisão manual lê. */
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
