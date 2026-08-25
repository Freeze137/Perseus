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
 * O banco de onde a língua sorteia: primeiro as frases escritas na mão, depois
 * as que vieram do Tatoeba.
 *
 * Concatenado em vez de fundido num arquivo só pros dois manterem a
 * procedência. As curadas têm tag de registro e voz; as importadas têm volume e
 * podem ser regeradas a qualquer momento rodando scripts/ingest-tatoeba.mjs.
 * Perder essa separação seria nunca mais conseguir reimportar sem catar as
 * originais na mão.
 */
const PHRASES: Record<Language, readonly Phrase[]> = {
  'pt-BR': [...PHRASES_PT_BR, ...TATOEBA_PT_BR],
  en: [...PHRASES_EN, ...TATOEBA_EN],
};

/**
 * Frase feita só de letra, espaço e ponto final.
 *
 * É o que o modo `words` consegue descascar sem estragar: nenhuma vírgula pra
 * perder, nenhum hífen pra engolir, nenhum dígito que só faz sentido colado num
 * símbolo. O resto fica fora desse pool em vez de entrar deformado.
 */
const PLAIN_SENTENCE = /^[\p{L}\p{M} ]+\.$/u;

/**
 * Todo texto que alguém digita sai de um destes pools.
 *
 * Separado por alcance além de por língua, e separado uma vez no load do módulo
 * em vez de a cada sorteio: os bancos têm milhares de frases cada, e um filtro
 * rodando a cada regeração do tamanho de uma tecla pagaria pela mesma resposta
 * de novo e de novo.
 */
const POOLS = {
  all: byLanguage((bank) => bank),
  simple: byLanguage((bank) =>
    bank.filter((phrase) => PLAIN_SENTENCE.test(phrase.text)),
  ),
  // Pontuação interna, com a marca final cortada antes. Frase cuja única
  // pontuação é o ponto de interrogação do fim não treina nada do que este modo
  // existe pra treinar — vírgula e ponto e vírgula são o ponto inteiro, e um
  // banco grande o bastante pra ter milhares de perguntas simples enche o modo
  // com elas se o filtro olhar o último caractere.
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
 * Joga fora as frases que o teclado não digita.
 *
 * A frase fica ou sai inteira. Reescrever "café" como "cafe" era a alternativa
 * óbvia e é a errada: põe um erro de ortografia na tela e pede pra pessoa
 * treinar digitar aquilo, que é pior de ensinar do que uma corrida mais curta.
 * Os bancos em inglês são ASCII puro, então isso não custa nada pra eles.
 */
function byReach(pool: readonly Phrase[]): Record<Reach, readonly Phrase[]> {
  return {
    full: pool,
    ascii: pool.filter((phrase) => reaches('ascii', phrase.text)),
  };
}

/** Snippets agrupados uma vez, pra corrida não filtrar o banco todo por sorteio. */
const BY_SYNTAX = SNIPPETS.reduce<Record<string, Snippet[]>>((groups, snippet) => {
  (groups[snippet.syntax] ??= []).push(snippet);
  return groups;
}, {});

export function phrases(language: Language): readonly Phrase[] {
  return PHRASES[language];
}

type ProseKind = Exclude<TextKind, 'code'>;

/**
 * De qual pool cada modo de prosa sorteia.
 *
 * Escrito aqui em vez de ficar implícito nos builders porque o seed tem que
 * responder a mesma pergunta que o builder — se este teclado estreita este pool
 * — e dois lugares decidindo isso separado são dois lugares pra errar.
 */
const KIND_POOLS: Record<ProseKind, keyof typeof POOLS> = {
  words: 'simple',
  quote: 'all',
  punctuation: 'punctuated',
  numbers: 'numeric',
};

/** Os dois alcances do pool desta config. Nunca chamado pra código. */
function poolsFor(config: SessionConfig): Record<Reach, readonly Phrase[]> {
  return POOLS[KIND_POOLS[config.kind as ProseKind]][config.language];
}

/**
 * O alcance com que esta corrida sorteia de verdade.
 *
 * Não é simplesmente o alcance do teclado: teclado US não estreita nada nos
 * bancos em inglês, que são ASCII de ponta a ponta. Reportar 'ascii' ali
 * colocaria o layout no seed de uma corrida que ele não muda, e um americano
 * trocando a configuração de ABNT2 pra US veria o texto em inglês mudar sem
 * motivo visível.
 *
 * Tamanho igual quer dizer pool igual — 'ascii' é feito filtrando 'full', então
 * é sempre subconjunto dele.
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
 * Quanto do banco o teclado desta corrida alcança de verdade.
 *
 * Existe pra interface dizer o que o filtro fez em vez de chutar. Aviso com
 * "cerca de um quinto" chumbado é aviso que começa a mentir calado na primeira
 * vez que alguém adiciona frase no banco.
 *
 * Código reporta o pool inteiro: todo snippet é ASCII, então nenhum teclado
 * fica sem nenhum.
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
 * Monta o texto da corrida. Determinístico pra uma config: mesmo seed e mesmas
 * configurações dão sempre os mesmos caracteres.
 *
 * Todo modo sorteia frase inteira do banco. Nada aqui concatena token: um fluxo
 * de palavras soltas treina as letras enquanto ensina um ritmo que língua
 * nenhuma tem, e o ritmo é boa parte do que se treina. Os modos diferem em
 * *quais* frases sorteiam e em quanta pontuação sobrevive — nunca em o texto
 * querer dizer alguma coisa.
 */
export function generate(config: SessionConfig): string {
  return run(config).text;
}

/**
 * Quantas frases esta corrida tira da sacola.
 *
 * O browser precisa disso pra avançar o cursor, e tem que ser a conta que o
 * sorteio usou de verdade, não estimativa: errar por um aqui ou pula uma frase
 * que ninguém vê ou repete uma que todo mundo vê.
 */
export function drawCount(config: SessionConfig): number {
  return run(config).drawn;
}

function run(config: SessionConfig): Drawn {
  const built = BUILDERS[config.kind](createRandom(seedOf(config)), config);
  return { text: built.text.trim(), drawn: built.drawn };
}

/**
 * O seed carrega exatamente os campos que o modo lê.
 *
 * Código ignora a língua humana, então a língua não pode entrar no seed dele:
 * senão trocar a interface de português pra inglês entregaria um Rust diferente
 * pro programador, que é exatamente os dois eixos vazando um no outro que
 * separá-los deveria evitar. A sintaxe entra pelo motivo espelhado — sem ela,
 * Rust e Go reproduziriam a mesma ordem de sorteio contra dois pools.
 *
 * Sintaxe null vira 'mix' aqui e no builder, pra as duas formas de dizer
 * "qualquer uma" não produzirem dois textos.
 *
 * O teclado entra no seed de prosa como *alcance*, nunca como nome, e nunca
 * entra no de código — o banco de snippets é ASCII puro, então nenhum teclado
 * que o app oferece falha em digitá-lo. Tem teste garantindo isso.
 */
function seedOf(config: SessionConfig): string {
  if (config.kind === 'code') return `${config.seed}:code:${config.syntax ?? 'mix'}`;
  // Só o *id* da sacola molda o embaralhamento da prosa, nunca o cursor. Dobrar
  // o cursor aqui reembaralharia o pool a cada avanço, que é sorteio com
  // reposição de novo, vestido de sacola.
  const { id } = positionOf(config.seed);
  return `${id}:${config.language}:${config.kind}:${reachFor(config)}`;
}

/** Um texto montado e quantas frases da sacola ele consumiu. */
type Drawn = { readonly text: string; readonly drawn: number };

type Builder = (random: Random, config: SessionConfig) => Drawn;

const BUILDERS: Record<TextKind, Builder> = {
  // Frases de verdade com a maiúscula e o ponto tirados. O treino aqui é
  // alcance de letra e ritmo, então Shift e pontuação ficam de fora — mas as
  // palavras embaixo ainda são uma frase que alguém escreveu.
  words: (_random, config) => {
    const run = drawFromBag(config);
    return { text: stripped(run.text), drawn: run.drawn };
  },

  // Frases inteiras do banco, nunca cortadas no meio da ideia.
  quote: (_random, config) => drawFromBag(config),

  // Também frases de verdade, só que as que têm pontuação interna. Costurar
  // palavra aleatória e salpicar vírgula por cima treinaria os símbolos
  // ensinando um ritmo que frase nenhuma tem.
  punctuation: (_random, config) => drawFromBag(config),

  // Frases que já carregam número — um atraso de dezoito minutos, uma conta em
  // reais. Injetar dígito num fluxo de palavras no cara ou coroa treina a linha
  // de cima fora de contexto, que é justamente o que faz a linha de cima ser
  // difícil: você nunca sabe que ela vem.
  numbers: (_random, config) => drawFromBag(config),

  // Funções inteiras, indentação e tudo. `language` é ignorado de propósito:
  // Rust se lê igual em São Paulo e em Seattle, e juntar os dois eixos daria um
  // corpus por par deles.
  //
  // `keyboardLayout` é ignorado por outro motivo: todo snippet é ASCII, então
  // nenhum layout fica sem caractere aqui. O que muda entre eles é quanto o
  // dedo anda pra alcançar uma chave, e isso é o treino, não motivo pra entregar
  // um banco menor.
  code: (random, config) => ({
    text: drawCode(random, config.length, config.syntax ?? 'mix'),
    // Código não tem sacola: o pool de snippets tem 66 entradas e uma corrida
    // leva quase todas, então não há o que distribuir sem repetir. A variedade
    // continua vindo do seed, que o cursor muda a cada corrida nova.
    drawn: 0,
  }),
};

/**
 * Puxa snippets inteiros até fechar o orçamento, sem repetir.
 *
 * Junta com linha em branco em vez de espaço: duas funções coladas numa linha
 * não é código que alguém já leu, e a linha em branco já vale duas quebras de
 * digitação que um arquivo de verdade teria.
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
 * Distribui frases do topo da sacola desta corrida até fechar o orçamento.
 *
 * A sacola é o que impede uma frase voltar antes de o pool ter sido percorrido. O
 * sorteio antigo escolhia aleatório com um Set `used`, o que evitava uma corrida
 * se repetir mas não lembrava nada entre corridas: todo seed novo amostrava o
 * pool inteiro de novo, então duas corridas seguidas dividiam uma frase umas
 * vinte por cento das vezes, no banco de então.
 *
 * Nada é cortado na emenda. Corrida que começa perto do fim de uma passada rola
 * pra próxima, reembaralhada, em vez de terminar cedo — ver `phraseAt`.
 */
function drawFromBag(config: SessionConfig): Drawn {
  const pool = drawnPool(config);
  if (pool.length === 0) return { text: '', drawn: 0 };

  const base = seedOf(config);
  const { cursor } = positionOf(config.seed);

  const chosen: string[] = [];
  let length = 0;
  let drawn = 0;

  // Nunca mais que uma passada inteira: além disso a corrida começaria a se
  // repetir, que era a única coisa que o `used` antigo acertava.
  while (length < config.length && drawn < pool.length) {
    const phrase = phraseAt(pool, base, cursor + drawn);
    chosen.push(phrase.text);
    length += phrase.text.length + 1;
    drawn += 1;
  }

  return { text: chosen.join(' '), drawn };
}

/**
 * Passa pra minúscula e tira os pontos finais.
 *
 * Só é seguro no pool `simple`, cujas frases não têm pontuação que valha
 * guardar. Rodar isto em cima de uma vírgula muda calado o que a frase diz.
 */
function stripped(text: string): string {
  return text.toLowerCase().replaceAll('.', '');
}
