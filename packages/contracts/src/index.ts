import { z } from 'zod';

export const LanguageSchema = z.enum(['pt-BR', 'en']);
export type Language = z.infer<typeof LanguageSchema>;

/**
 * O teclado físico na frente da pessoa.
 *
 * Outro eixo, diferente de `Language`: a prosa é português ou inglês, a sintaxe
 * é Rust ou Go, e isto é o hardware que tem que produzir os dois. Fica aqui e
 * não só nas configurações do site porque muda quais caracteres são alcançáveis
 * e, portanto, qual texto pode ser sorteado — e tudo que muda o texto tem que
 * viajar junto da config que o servidor regera.
 *
 * 'abnt2'   — layout brasileiro. Alcança tudo: Ç tem tecla própria e os acentos
 *             saem das mortas ´ ` ~ ^. Colchete é direto e chave é Shift, como
 *             em qualquer teclado — AltGr aqui compra ² ³ £ ¢ ¬ e nada que
 *             apareça em código.
 * 'us'      — layout americano puro. ASCII e mais nada: não existe sequência de
 *             teclas nele que produza "á" ou "ç".
 * 'us-intl' — o americano com teclas mortas. Mesmos acentos do ABNT2 e os
 *             mesmos colchetes diretos do 'us' — ao preço de ' e " virarem
 *             teclas mortas.
 */
export const KeyboardLayoutSchema = z.enum(['abnt2', 'us', 'us-intl']);
export type KeyboardLayout = z.infer<typeof KeyboardLayoutSchema>;

export const TextKindSchema = z.enum([
  'words',
  'quote',
  'punctuation',
  'numbers',
  'code',
]);
export type TextKind = z.infer<typeof TextKindSchema>;

/**
 * Uma linguagem de programação, que é um eixo diferente de `Language`.
 *
 * `Language` é a língua humana em que a prosa está escrita; isto é a sintaxe em
 * que o snippet está. Uma nunca restringe a outra — brasileiro e americano
 * digitam o mesmo Rust — então são campos separados em vez de dobrados numa
 * "linguagem" só, que é o que um enum único convidaria a fazer.
 */
export const SyntaxSchema = z.enum([
  'typescript',
  'javascript',
  'python',
  'rust',
  'go',
  'java',
  'kotlin',
  'swift',
  'csharp',
  'cpp',
  'c',
  'ruby',
  'php',
  'bash',
  'sql',
]);
export type Syntax = z.infer<typeof SyntaxSchema>;

/** O que a pessoa escolhe. 'mix' sorteia entre todas as sintaxes numa corrida. */
export const SyntaxChoiceSchema = z.union([SyntaxSchema, z.literal('mix')]);
export type SyntaxChoice = z.infer<typeof SyntaxChoiceSchema>;

/**
 * Tudo que é preciso pra reproduzir um teste igualzinho. A semente é o que faz
 * a corrida ser compartilhável: mesma config, mesmo texto, pra quem abrir o link.
 */
export const SessionConfigSchema = z.object({
  language: LanguageSchema,
  kind: TextKindSchema,
  /** Orçamento de caracteres que o gerador tenta acertar. */
  length: z.int().min(10).max(2_000),
  seed: z.string().min(1).max(64),
  durationMs: z.int().positive().nullable().default(null),
  /**
   * Só é lido quando `kind` é 'code'; null no resto. Fica em toda config em vez
   * de num tipo só pra código pra que uma semente mais uma config continuem
   * reproduzindo um texto, seja qual for o modo.
   */
  syntax: SyntaxChoiceSchema.nullable().default(null),
  /**
   * O teclado em que a corrida foi digitada. Lido por todo builder de prosa e
   * por nenhum de código — ver KeyboardLayoutSchema.
   *
   * Tem default em vez de ser obrigatório pra dar pra escrever uma config na
   * mão sem citá-lo, e o default é ABNT2 porque é o teclado pro qual o corpus
   * pt-BR padrão foi escrito.
   */
  keyboardLayout: KeyboardLayoutSchema.default('abnt2'),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

/**
 * A geração do corpus que produziu um texto.
 *
 * Só a semente deixa de bastar no instante em que resultado passa a ser
 * guardado: a mesma semente e a mesma config dão texto diferente depois que os
 * bancos mudam, então uma corrida salva começaria calada a reproduzir uma coisa
 * que o dono nunca digitou. Suba isto sempre que um builder mudar ou os bancos
 * forem editados, e os resultados antigos continuam apontando pro corpus contra
 * o qual rodaram de verdade.
 *
 * 1 — os bancos originais, com `words` e `numbers` montados de tokens soltos.
 * 2 — todo modo sorteando frase inteira; `code` e o banco de snippets entraram.
 * 3 — mais dez sintaxes no banco de snippets. Nada existente foi editado, mas
 *     'mix' passou a sortear de um banco do dobro do tamanho, então toda
 *     corrida mista antiga reproduz contra um corpus que ela nunca viu.
 * 4 — `keyboardLayout` entrou na config, e as pools de prosa passaram a ser
 *     sorteadas por alcance. Corrida em layout US sorteia do subconjunto que o
 *     teclado digita, então semente e língua sozinhas já não nomeiam um texto.
 * 5 — os bancos do Tatoeba entraram junto dos escritos à mão: cerca de 5.600
 *     frases por língua em cima das 197 originais. Toda pool cresceu, então
 *     toda semente antiga cai em outro lugar. A pool ASCII em português foi a
 *     que mais cresceu — de 22 frases para 1.761 — o que faz da corrida em
 *     português com layout US a que mudou além do reconhecível.
 * 6 — o sorteio de prosa virou sacola de embaralhamento. A semente agora carrega
 *     uma posição dentro dela ("id.cursor"), então o texto continua sendo função
 *     pura da config — o servidor precisa conseguir regerá-lo pra pontuar — mas
 *     corridas seguidas distribuem de uma passada embaralhada em vez de amostrar
 *     a pool inteira de novo toda vez. Semente sem cursor é lida como o topo da
 *     sacola, e é isso que deixa o duelo intocado.
 * 7 — a cota de frases sem acento passou a ser servida por pool, não em bloco.
 *     Um teclado US puro em português via 32% do banco, e o que via estava
 *     empilhado num modo só: pontuação em 28%, números em 23%. Agora as pools
 *     ficam parelhas em torno de 43%. Números continua em 23% por limite da
 *     língua, não do filtro — existem 483 frases portuguesas com dígitos e sem
 *     nenhum acento em todo o Tatoeba.
 */
export const CORPUS_VERSION = 7;

export const TypingResultSchema = z.object({
  id: z.uuid(),
  config: SessionConfigSchema,
  /** Qual geração do corpus produziu o texto. Ver CORPUS_VERSION. */
  corpusVersion: z.int().positive(),
  wpm: z.number().nonnegative(),
  /** Caracteres certos por minuto. O número honesto pra corrida de código. */
  cpm: z.number().nonnegative(),
  rawWpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  correct: z.int().nonnegative(),
  incorrect: z.int().nonnegative(),
  durationMs: z.int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type TypingResult = z.infer<typeof TypingResultSchema>;

/**
 * Um caractere confirmado, do jeito que viaja pela rede.
 *
 * `correct` está ausente de propósito. O cliente sabe, mas um ranking que
 * acreditasse no cliente seria um ranking de quem abriu o console primeiro. O
 * servidor recalcula contra o texto que ele mesmo regera.
 */
export const SubmittedKeystrokeSchema = z.object({
  /** Um grafema. Maior que um code point porque "ã" pode chegar composto. */
  char: z.string().min(1).max(8),
  /**
   * Milissegundos no relógio do próprio cliente, monotônico dentro de uma corrida.
   *
   * Milissegundo inteiro, não o número quebrado que o `performance.now()`
   * devolve. As casas extras não mudam pontuação que alguém perceba e custam
   * quatro bytes em cada tecla de cada corrida, o que num texto longo é boa
   * parte da diferença entre uma requisição que cabe no limite do corpo e uma
   * que não cabe. Teto de seis horas: além disso não é corrida de digitação.
   */
  at: z.int().nonnegative().max(21_600_000),
  index: z.int().nonnegative(),
});
export type SubmittedKeystroke = z.infer<typeof SubmittedKeystrokeSchema>;

/**
 * O que uma mão humana consegue de verdade, e a folga em volta do relógio.
 *
 * São os números que decidem se uma timeline é recusada, então estão escritos
 * uma vez, aqui, ao lado do schema que guardam — e não dentro do serviço que
 * por acaso os aplica hoje.
 *
 * São generosos de propósito. Um teto que corta o digitador mais rápido de
 * verdade é pior que um teto embaixo do qual um bot determinado consegue ficar:
 * o primeiro quebra o esporte pra quem ele existe, e o segundo só obriga a
 * fraude a ser lenta o bastante pra ser sem graça. Nada aqui finge pegar bot que
 * digita em velocidade crível e em tempo real — isso não é detectável numa
 * timeline, e dizer o contrário seria o tipo errado de conforto.
 */
export const TIMELINE_LIMITS = {
  /**
   * Caracteres por minuto, na média da corrida inteira. O recorde humano
   * verificado fica em torno de 1 080 (216 ppm em prosa); isto deixa uma margem
   * larga por cima e ainda recusa os números de seis dígitos que um relógio
   * forjado produz.
   */
  maxCpm: 1_500,
  /**
   * Piso do intervalo *mediano* entre teclas. Mediana e não mínimo porque
   * rollover existe: duas teclas caem mesmo a poucos milissegundos uma da outra
   * quando os dedos se sobrepõem. Mediana abaixo disto é máquina, não mão rápida.
   */
  minMedianGapMs: 22,
  /**
   * Intervalo maior que isto é gente atendendo a porta, não digitando. Fica de
   * fora da nota de ritmo em vez de contar como ritmo horrível.
   */
  afkGapMs: 3_000,
  /**
   * Piso do coeficiente de variação dos intervalos. Ritmo humano vagueia; loop
   * com sleep fixo não. Só é aplicado quando há teclas suficientes pro número
   * querer dizer alguma coisa.
   */
  minGapVariation: 0.06,
  /** Abaixo desta quantidade de teclas, variação é ruído e não é julgada. */
  variationSampleFloor: 30,
  /**
   * Quanto a duração alegada pode passar do relógio de parede que o próprio
   * servidor mediu entre emitir o bilhete e receber o envio. Cobre desvio de
   * relógio e upload lento, mais nada.
   */
  clockSlackMs: 30_000,
} as const;

/**
 * A permissão do servidor pra abrir uma corrida, entregue antes de a digitação
 * começar.
 *
 * É assinado e sem estado: o servidor não guarda tabela de corridas abertas, só
 * recusa o que ele não assinou. O que isso compra não é detectar fraude rápida
 * — ver TIMELINE_LIMITS pra por que isso não está à venda — mas um teto de
 * volume. Um resultado por bilhete, um bilhete por requisição, e corrida que
 * alega ter durado mais que o relógio que o servidor observou é recusada.
 */
export const RunTicketSchema = z.object({
  id: z.uuid(),
  /** Epoch em milissegundos, do relógio do próprio servidor. */
  issuedAt: z.int().positive(),
  /** HMAC sobre os dois campos acima. Não quer dizer nada pro cliente. */
  signature: z.string().min(16).max(128),
});
export type RunTicket = z.infer<typeof RunTicketSchema>;

/** Quanto tempo um bilhete fica parado antes de parar de abrir corrida. */
export const RUN_TICKET_TTL_MS = 4 * 60 * 60 * 1_000;

/**
 * O que o cliente manda quando o sync está ligado.
 *
 * Manda o que fez, não como se pontuou. O servidor regera o alvo a partir de
 * `config` e `corpusVersion`, reproduz esta timeline contra ele e calcula os
 * números sozinho; nada do que o cliente alega sobre a própria velocidade é
 * guardado. O dono vem do token da sessão, nunca do corpo da requisição.
 */
export const SubmitResultSchema = z.object({
  config: SessionConfigSchema,
  corpusVersion: z.int().positive(),
  /** O bilhete tirado quando a corrida começou. Um resultado por bilhete. */
  run: RunTicketSchema,
  /** Com teto: corrida legítima não passa disso, e array sem limite é DoS. */
  keystrokes: z.array(SubmittedKeystrokeSchema).min(1).max(5_000),
});
export type SubmitResult = z.infer<typeof SubmitResultSchema>;

/**
 * Por que um envio foi recusado, num formato em que o cliente consegue ramificar.
 *
 * A mensagem é pra pessoa lendo log; isto é pra interface decidir o que dizer.
 * `corpus_version` em especial não é culpa de quem digitou — a aba dele ficou
 * aberta durante um deploy — e mandar recarregar é uma tela diferente de dizer
 * que a corrida pareceu forjada.
 */
export const SubmitErrorCodeSchema = z.enum([
  /** A aba está rodando um corpus que este servidor não regera mais. */
  'corpus_version',
  /** Bilhete de corrida ausente, forjado ou vencido. */
  'run_ticket',
  /** Esta corrida já foi guardada. */
  'duplicate',
  /** A timeline não é coisa que uma mão produziu. */
  'implausible',
  /** A timeline não reproduz contra o texto que ela mesma nomeia. */
  'invalid_timeline',
]);
export type SubmitErrorCode = z.infer<typeof SubmitErrorCodeSchema>;

/** O corpo que um envio recusado carrega, junto do status HTTP. */
export const ApiErrorBodySchema = z.object({
  code: SubmitErrorCodeSchema,
  message: z.string(),
  /** Preenchido no 'corpus_version': o que este servidor consegue verificar. */
  expected: z.int().positive().optional(),
});
export type ApiErrorBody = z.infer<typeof ApiErrorBodySchema>;

export const LeaderboardEntrySchema = z.object({
  rank: z.int().positive(),
  username: z.string().min(1).max(32),
  wpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  achievedAt: z.iso.datetime(),
});
export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

/**
 * O escopo de um ranking.
 *
 * Código e prosa nunca dividem o mesmo: cinco caracteres são uma palavra em
 * prosa inglesa e não são nada em Rust, então uma ordenação só classificaria os
 * dois com uma régua que serve pra um.
 */
export const LeaderboardQuerySchema = z.object({
  kind: TextKindSchema.default('words'),
  language: LanguageSchema.default('pt-BR'),
  syntax: SyntaxChoiceSchema.nullable().default(null),
  /** Quantos dias pra trás considerar. Null é desde sempre. */
  windowDays: z.int().positive().max(365).nullable().default(null),
  limit: z.int().positive().max(200).default(50),
});
export type LeaderboardQuery = z.infer<typeof LeaderboardQuerySchema>;

/**
 * Uma corrida sua do passado, do jeito que o endpoint de histórico devolve.
 *
 * Resultado era só de escrita até isto existir: a tabela gravava toda corrida e
 * não oferecia ao dono jeito nenhum de ler uma de volta, então o único registro
 * de progresso que alguém tinha era o que ainda estivesse na tela. Isto é lido
 * pelo token de quem chama, dentro das políticas de linha, e não com a chave de
 * serviço — seu histórico é exatamente as linhas que o banco já concorda que
 * são suas.
 */
export const StoredResultSchema = z.object({
  id: z.uuid(),
  kind: TextKindSchema,
  language: LanguageSchema,
  syntax: SyntaxChoiceSchema.nullable(),
  wpm: z.number().nonnegative(),
  cpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().nonnegative(),
  completedAt: z.iso.datetime(),
});
export type StoredResult = z.infer<typeof StoredResultSchema>;

export const HistoryQuerySchema = z.object({
  kind: TextKindSchema.optional(),
  limit: z.int().positive().max(100).default(20),
});
export type HistoryQuery = z.infer<typeof HistoryQuerySchema>;

/** O histórico pessoal mais os melhores dele, numa ida e volta só. */
export const HistoryResponseSchema = z.object({
  entries: z.array(StoredResultSchema),
  best: z
    .object({
      wpm: z.number().nonnegative(),
      accuracy: z.number().min(0).max(100),
    })
    .nullable(),
});
export type HistoryResponse = z.infer<typeof HistoryResponseSchema>;

/**
 * O ranking mais se ele é um ranking neste momento.
 *
 * Array vazio significava ao mesmo tempo "ninguém pontuou ainda" e "o banco não
 * respondeu", que são coisas opostas de dizer pra alguém: a primeira é um
 * convite e a segunda é um pedido de desculpa. O status volta a separar as
 * duas, e mantém a falha honesta em vez de vesti-la de lista vazia.
 */
export const LeaderboardStatusSchema = z.enum(['ok', 'unavailable']);
export type LeaderboardStatus = z.infer<typeof LeaderboardStatusSchema>;

export const LeaderboardResponseSchema = z.object({
  status: LeaderboardStatusSchema,
  entries: z.array(LeaderboardEntrySchema),
});
export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;

/** O piso de precisão que a corrida tem que passar pra aparecer no ranking. */
export const LEADERBOARD_MIN_ACCURACY = 90;

/* ---------------------------------------------------------------------------
 * Duel — private 1v1
 *
 * Duas pessoas, um texto, um código de convite. O texto nunca trafega: ele é
 * função pura da semente e da config, que o servidor entrega aos dois
 * jogadores, então os dois clientes geram os mesmos caracteres por construção.
 * É por causa dessa propriedade que o `packages/corpus` é determinístico.
 *
 * O progresso ao vivo que viaja entre eles é decoração. A pontuação é o mesmo
 * replay no servidor que uma corrida solo recebe — ver SubmitResultSchema —
 * porque uma colocação vinda do canal em tempo real seria uma colocação que o
 * cliente digita no console, enquanto a solo não.
 * ------------------------------------------------------------------------- */

/** Duelo é duas pessoas. Não é tamanho de sala: é regra que o fluxo inteiro supõe. */
export const MATCH_PLAYERS = 2;

/**
 * O alfabeto do convite, sem os glifos ambíguos.
 *
 * Código é lido em voz alta ou redigitado de um print pelo menos tanto quanto é
 * clicado, e 0/O e 1/I são exatamente os pares que falham nisso.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const INVITE_CODE_LENGTH = 6;

/**
 * A pausa entre a sala encher e o texto destravar.
 *
 * Os dois clientes já têm o texto; o que esperam é a mão um do outro. Cinco
 * segundos é tempo de endireitar na cadeira e pouco o bastante pra ninguém dar
 * alt-tab no meio.
 */
export const MATCH_COUNTDOWN_MS = 5_000;

/**
 * Quanto tempo o segundo tem depois que o primeiro termina.
 *
 * As duas regras alternativas são piores: encerrar o duelo na primeira chegada
 * tira a corrida de quem está a três palavras do fim, e esperar pra sempre deixa
 * uma aba fechada segurando a sala aberta.
 */
export const MATCH_GRACE_MS = 30_000;

/**
 * De quanto em quanto tempo o cliente publica a posição do cursor.
 *
 * Abaixo disto o olho não vê diferença e o tráfego dobra. As atualizações
 * perdem pacote de propósito: uma perdida custa um quadro da barra de progresso
 * do outro, e a pontuação não vem daqui.
 */
export const MATCH_PROGRESS_MS = 200;

/** Sala em que ninguém entra é varrida, não guardada. */
export const MATCH_LOBBY_TTL_MS = 15 * 60_000;

/**
 * O teto do duelo inteiro, contado a partir da contagem regressiva.
 *
 * Só é alcançado quando as duas abas somem antes de qualquer um terminar, que é
 * o único caso que o tempo de graça não fecha: o relógio da graça nunca começa.
 */
export const MATCH_MAX_RUN_MS = 20 * 60_000;

/** Quantos duelos terminados o browser guarda na lista de histórico dele. */
export const MATCH_HISTORY_MAX = 50;

/**
 * O nome que o jogador veste por um duelo.
 *
 * Escolhido por partida em vez de vir de uma conta: duelo não precisa de login,
 * e pedir pra dois amigos criarem conta antes de correr é atrito do tamanho da
 * feature inteira. Fica guardado com a partida depois, e é isso que faz o
 * histórico ser legível um mês mais tarde.
 */
export const DisplayNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(20)
  // Nada de caractere de controle, incluindo os overrides bidi que deixam um
  // nome reorganizar a linha em que é impresso.
  .regex(/^[^\p{C}]+$/u, 'name contains control characters');

export const InviteCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .length(INVITE_CODE_LENGTH)
  .regex(/^[A-Z2-9]+$/, 'not an invite code');

/**
 * 'lobby'     — criada, esperando o segundo jogador.
 * 'countdown' — os dois dentro, texto na tela, teclas ainda não aceitas.
 * 'running'   — digitando.
 * 'done'      — pontuado, vencedor decidido, anotado.
 * 'abandoned' — a sala morreu antes de alguém terminar. Sem vencedor, sem registro.
 */
export const MatchStateSchema = z.enum([
  'lobby',
  'countdown',
  'running',
  'done',
  'abandoned',
]);
export type MatchState = z.infer<typeof MatchStateSchema>;

/**
 * Como o duelo terminou pra um jogador.
 *
 * 'unfinished' é o interessante: ele ainda estava digitando quando o tempo de
 * graça acabou. Está dito como fato — o texto não foi terminado a tempo — e não
 * como piada às custas dele, porque o resto deste produto não cutuca quem foi
 * mal e este não é o lugar pra começar.
 */
export const MatchOutcomeSchema = z.enum([
  'won',
  'lost',
  /** Os dois terminaram com a mesma pontuação, até a segunda casa. */
  'draw',
  /** Não chegou ao fim do texto dentro do tempo de graça. */
  'unfinished',
  /** A sala morreu antes de alguém terminar. */
  'abandoned',
]);
export type MatchOutcome = z.infer<typeof MatchOutcomeSchema>;

/** O que o servidor derivou da timeline do jogador. Nunca o que ele alegou. */
export const MatchScoreSchema = z.object({
  wpm: z.number().nonnegative(),
  cpm: z.number().nonnegative(),
  accuracy: z.number().min(0).max(100),
  consistency: z.number().min(0).max(100),
  durationMs: z.int().nonnegative(),
});
export type MatchScore = z.infer<typeof MatchScoreSchema>;

export const MatchPlayerSchema = z.object({
  /** 1 é quem criou, 2 é quem entrou pelo convite. */
  slot: z.int().min(1).max(MATCH_PLAYERS),
  displayName: DisplayNameSchema,
  joinedAt: z.iso.datetime(),
  /**
   * O índice do cursor que este jogador publicou por último. Decoração: move a
   * barra de progresso do outro e mais nada, e de propósito não entra na
   * pontuação.
   */
  progress: z.int().nonnegative(),
  finishedAt: z.iso.datetime().nullable(),
  score: MatchScoreSchema.nullable(),
  outcome: MatchOutcomeSchema.nullable(),
  /**
   * Se este jogador pediu outra rodada.
   *
   * Os dois têm que pedir. Revanche que começasse porque um clicou arrastaria o
   * outro pra uma corrida que ele já tinha encerrado — e quem quis estaria
   * digitando antes de quem não quis ter lido o placar.
   */
  rematch: z.boolean(),
});
export type MatchPlayer = z.infer<typeof MatchPlayerSchema>;

export const MatchSchema = z.object({
  /** A sala. Estável entre revanches: é pra onde o link aponta. */
  id: z.uuid(),
  /**
   * A rodada em jogo agora, e o id sob o qual o duelo terminado é guardado.
   *
   * Uma sala hospeda vários duelos em sequência, e cada um é uma linha própria
   * no histórico — então a sala não pode ser o que identifica a partida. É isto
   * que o browser lembra quando quer ver um duelo de novo.
   */
  roundId: z.uuid(),
  inviteCode: InviteCodeSchema,
  state: MatchStateSchema,
  /** Inclui a semente, que o servidor escolhe. Os dois clientes montam a partir dela. */
  config: SessionConfigSchema,
  corpusVersion: z.int().positive(),
  createdAt: z.iso.datetime(),
  /** Epoch ms em que as teclas destravam. Null até a sala encher. */
  startsAt: z.int().positive().nullable(),
  /** Epoch ms em que o tempo de graça acaba. Null até alguém terminar. */
  graceEndsAt: z.int().positive().nullable(),
  finishedAt: z.iso.datetime().nullable(),
  winnerSlot: z.int().min(1).max(MATCH_PLAYERS).nullable(),
  players: z.array(MatchPlayerSchema).max(MATCH_PLAYERS),
  /**
   * O relógio do servidor quando este retrato foi escrito.
   *
   * Todo retrato carrega isso pro cliente guardar um deslocamento contra o
   * próprio relógio e contar a mesma regressiva que o servidor conta. Sem isso,
   * dois browsers cujos relógios discordam em dez segundos começariam dez
   * segundos separados — no mesmo texto, com o mesmo servidor, e sem jeito de
   * perceber.
   */
  serverNow: z.int().positive(),
});
export type Match = z.infer<typeof MatchSchema>;

/**
 * O que quem cria a sala pede. Não é um SessionConfig inteiro: a semente é do
 * servidor, porque um cliente que escolhesse a semente poderia sortear o texto,
 * digitar uma vez offline e só então abrir a sala.
 */
export const CreateMatchSchema = z.object({
  displayName: DisplayNameSchema,
  language: LanguageSchema,
  kind: TextKindSchema,
  length: z.int().min(10).max(2_000),
  syntax: SyntaxChoiceSchema.nullable().default(null),
  keyboardLayout: KeyboardLayoutSchema.default('abnt2'),
});
export type CreateMatch = z.infer<typeof CreateMatchSchema>;

export const JoinMatchSchema = z.object({ displayName: DisplayNameSchema });
export type JoinMatch = z.infer<typeof JoinMatchSchema>;

/**
 * Sorteia outro texto pra sala, opcionalmente com outro tamanho.
 *
 * É decisão de quem criou, e só antes de as teclas destravarem: trocar o texto
 * debaixo de quem já está digitando é o mesmo que apagar a corrida dele. A
 * semente continua sendo do servidor, pelo motivo escrito acima do
 * `CreateMatchSchema` — quem escolhesse já poderia ter digitado o texto.
 *
 * `length` omitido quer dizer "mesmo tamanho, outras palavras", que é o que o
 * botão diz quando ninguém mexe no controle.
 */
export const ReseedMatchSchema = z.object({
  length: z.int().min(10).max(2_000).optional(),
});
export type ReseedMatch = z.infer<typeof ReseedMatchSchema>;

/**
 * A sala, o lugar nela, e a única prova de estar dentro.
 *
 * O token é o que separa um jogador de um espectador segurando o mesmo código.
 * Sem ele, quem lesse o convite por cima do ombro poderia publicar progresso
 * como qualquer um dos dois e enviar uma timeline no nome dele.
 */
export const MatchCredentialsSchema = z.object({
  match: MatchSchema,
  slot: z.int().min(1).max(MATCH_PLAYERS),
  token: z.string().min(16).max(256),
});
export type MatchCredentials = z.infer<typeof MatchCredentialsSchema>;

export const MatchProgressSchema = z.object({
  index: z.int().nonnegative().max(2_000),
});
export type MatchProgress = z.infer<typeof MatchProgressSchema>;

/** A mesma timeline que uma corrida solo envia, menos o bilhete: a sala é o bilhete. */
export const SubmitMatchRunSchema = z.object({
  keystrokes: z.array(SubmittedKeystrokeSchema).min(1).max(5_000),
});
export type SubmitMatchRun = z.infer<typeof SubmitMatchRunSchema>;

/**
 * O que desce pelo stream.
 *
 * Dois formatos em vez de um: um retrato inteiro sempre que a sala muda de
 * estado, e uma posição pelada sempre que o cursor de alguém anda. O segundo é
 * o frequente — cinco por segundo por jogador — e mandar a partida inteira a
 * cada passo do cursor seria quase toda a banda por nenhuma informação.
 */
export const MatchEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('match'), match: MatchSchema }),
  z.object({
    type: z.literal('progress'),
    slot: z.int().min(1).max(MATCH_PLAYERS),
    index: z.int().nonnegative(),
    serverNow: z.int().positive(),
  }),
]);
export type MatchEvent = z.infer<typeof MatchEventSchema>;

/** Um duelo terminado, do jeito que a lista de histórico o lê de volta. */
export const MatchSummarySchema = z.object({
  id: z.uuid(),
  inviteCode: InviteCodeSchema,
  kind: TextKindSchema,
  language: LanguageSchema,
  syntax: SyntaxChoiceSchema.nullable(),
  state: MatchStateSchema,
  finishedAt: z.iso.datetime().nullable(),
  winnerSlot: z.int().min(1).max(MATCH_PLAYERS).nullable(),
  players: z.array(
    z.object({
      slot: z.int().min(1).max(MATCH_PLAYERS),
      displayName: DisplayNameSchema,
      score: MatchScoreSchema.nullable(),
      outcome: MatchOutcomeSchema.nullable(),
    }),
  ),
});
export type MatchSummary = z.infer<typeof MatchSummarySchema>;

/**
 * Ler histórico é um lote, não uma requisição por duelo.
 *
 * Quem segura a lista de quais duelos são seus é o browser — não existe conta
 * pra pendurá-los — então ele devolve os ids e o servidor responde com os que
 * ainda tem.
 */
export const MatchSummariesQuerySchema = z.object({
  ids: z.array(z.uuid()).min(1).max(MATCH_HISTORY_MAX),
});
export type MatchSummariesQuery = z.infer<typeof MatchSummariesQuerySchema>;

export const MatchSummariesResponseSchema = z.object({
  status: LeaderboardStatusSchema,
  matches: z.array(MatchSummarySchema),
});
export type MatchSummariesResponse = z.infer<
  typeof MatchSummariesResponseSchema
>;

/**
 * Por que um pedido de duelo foi recusado, num formato em que a interface
 * consegue ramificar.
 *
 * Separado do SubmitErrorCode porque estas são respostas sobre uma sala, não
 * sobre uma timeline — e sala cheia pede tela diferente de timeline que não
 * reproduziu. Um envio de duelo ainda pode ser recusado por qualquer motivo do
 * SubmitErrorCode: o caminho de pontuação é o mesmo.
 */
export const MatchErrorCodeSchema = z.enum([
  'match_not_found',
  'match_full',
  /** Já rodando, já pontuada, ou varrida. */
  'match_closed',
  /** Ausente, forjado, ou de outra sala. */
  'match_token',
  /** Este lugar já enviou a corrida dele. */
  'already_finished',
  /** As teclas ainda não destravaram. */
  'not_started',
]);
export type MatchErrorCode = z.infer<typeof MatchErrorCodeSchema>;
