/**
 * Um caractere que a pessoa confirmou, e quando. `index` é a posição do alvo
 * contra a qual ele foi comparado.
 */
export type Keystroke = {
  readonly char: string;
  readonly at: number;
  readonly index: number;
  readonly correct: boolean;
};

export type SessionStatus = 'idle' | 'running' | 'finished';

export type SessionOptions = {
  /** Trava no primeiro erro em vez de marcar e seguir. */
  readonly stopOnError: boolean;
  /**
   * Na quebra de linha, pula a indentação que vem depois.
   *
   * Isso é pra código. Espaço no começo da linha não é habilidade — todo
   * editor põe sozinho — e obrigar a contar espaço treina justamente a parte
   * que ninguém digita na mão.
   */
  readonly autoIndent: boolean;
};

/**
 * Retrato imutável de uma corrida.
 *
 * `target` e `typed` são arrays de grafema, não string: no ABNT2 a tecla morta
 * mais a vogal dá um caractere visível feito de dois code points, e pra quem
 * digita foi uma tecla só.
 */
export type Session = {
  readonly target: readonly string[];
  readonly typed: readonly string[];
  readonly keystrokes: readonly Keystroke[];
  readonly startedAt: number | null;
  readonly finishedAt: number | null;
  readonly options: SessionOptions;
  /**
   * Posições que a máquina preencheu, não a pessoa — a auto-indentação.
   *
   * Andam com o cursor mas não valem ponto. Contar como acerto pagaria a quem
   * digita código por espaço que ele nunca apertou, e aí o número não quer
   * dizer nada.
   */
  readonly given: readonly number[];
};

export type Metrics = {
  readonly elapsedMs: number;
  /** Só os acertos, na conta padrão de 5 caracteres por palavra. */
  readonly wpm: number;
  /**
   * Caracteres certos por minuto, sem dividir.
   *
   * A palavra de cinco letras é convenção de prosa em inglês. Código não tem
   * palavra nesse sentido: `=>`, `!==` e uma chave fechando aninhada são
   * trabalho de verdade que o divisor achata. Por isso código se lê em CPM, e
   * o número aparece pra prosa também em vez de virar caso especial.
   */
  readonly cpm: number;
  /** Tudo que foi digitado, erro incluído. */
  readonly rawWpm: number;
  /** 0-100. */
  readonly accuracy: number;
  /** 0-100. Quão parelho é o ritmo entre as teclas. */
  readonly consistency: number;
  readonly correct: number;
  readonly incorrect: number;
};

export type KeyStat = {
  readonly key: string;
  readonly typed: number;
  readonly errors: number;
  /** Intervalo médio entre a tecla anterior e esta, em ms. */
  readonly avgLatencyMs: number;
};
