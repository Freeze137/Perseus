import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type {
  MatchEvent,
  MatchOutcome,
  MatchScore,
  MatchState,
  SessionConfig,
} from '@perseus/contracts';

/** Um jogador, como a sala o segura enquanto o duelo é jogado. */
export type RoomPlayer = {
  readonly slot: number;
  readonly displayName: string;
  readonly joinedAt: number;
  /** Último índice de cursor publicado. Decoração: nunca entra na pontuação. */
  progress: number;
  finishedAt: number | null;
  score: MatchScore | null;
  outcome: MatchOutcome | null;
  /** Pediu outra rodada. Limpo quando uma começa. */
  rematch: boolean;
};

/** Um duelo em andamento. Epoch em milissegundos aqui dentro; ISO é pra rede. */
export type Room = {
  readonly id: string;
  /**
   * A rodada em jogo, e o id sob o qual ela é guardada quando acaba.
   *
   * Sorteada de novo a cada revanche. A sala mantém id e código — é pra onde o
   * link aponta — enquanto cada duelo jogado nela ganha identidade nova, porque
   * cada um é uma linha própria no histórico.
   */
  roundId: string;
  readonly inviteCode: string;
  /** Sorteada de novo por quem criou, entre rodadas: semente nova e talvez tamanho novo. */
  config: SessionConfig;
  readonly corpusVersion: number;
  readonly createdAt: number;
  state: MatchState;
  startsAt: number | null;
  graceEndsAt: number | null;
  finishedAt: number | null;
  winnerSlot: number | null;
  players: RoomPlayer[];
};

/**
 * Uma conexão aberta com a sala: pra onde vão os eventos dela, e como fechar.
 *
 * O callback de fim é o que deixa a sala sobreviver ao duelo sem vazar. Sala
 * terminada continua transmitindo pelos cinco minutos em que a revanche pode
 * ser oferecida; quando é finalmente removida, todo ouvinte é fechado em vez de
 * ficar escutando uma sala que não existe mais.
 */
type Watcher = {
  next: (event: MatchEvent) => void;
  end: () => void;
};

/**
 * Teto de quantas salas existem ao mesmo tempo.
 *
 * Uma sala são algumas centenas de bytes e duas respostas abertas, então isto
 * não é sobre memória — é sobre a máquina de plano grátis onde isto roda
 * continuar respondendo se alguém scriptar o endpoint de criar. O rate limiter
 * é a primeira linha; isto é o muro atrás dela.
 */
export const MAX_ROOMS = 200;

/**
 * Todo duelo vivo, e todo mundo escutando um.
 *
 * Em memória de propósito. Duelo é duas pessoas por noventa segundos: a sala
 * nasce, é observada por exatamente duas conexões, e morre. Pôr isso no
 * Postgres seria uma linha escrita e apagada pra cada lobby abandonado, um poll
 * ou um LISTEN pra tirar de volta, e um schema no caminho de toda mudança de
 * fluxo — pra um estado cuja vida inteira é mais curta que o deploy que a
 * perderia. O que vale guardar é o duelo *terminado*, e isso é uma escrita só
 * no fim, no store ao lado.
 *
 * A consequência, já que é o tipo de coisa que se escreve em vez de deixar
 * alguém descobrir: isto não sobrevive a restart e não sobrevive a uma segunda
 * instância. Duelo em andamento durante um deploy termina como abandonado, e
 * dois processos de API atrás de um load balancer poriam os dois jogadores em
 * salas diferentes. Um processo é o deploy que isto assume; mais que isso pede
 * um canal compartilhado, não um mapa maior.
 */
@Injectable()
export class MatchRegistryService implements OnModuleDestroy {
  private readonly rooms = new Map<string, Room>();
  private readonly codes = new Map<string, string>();
  private readonly listeners = new Map<string, Set<Watcher>>();
  private readonly timers = new Map<string, Map<string, NodeJS.Timeout>>();

  get size(): number {
    return this.rooms.size;
  }

  add(room: Room): void {
    this.rooms.set(room.id, room);
    this.codes.set(room.inviteCode, room.id);
  }

  byId(id: string): Room | null {
    return this.rooms.get(id) ?? null;
  }

  byCode(code: string): Room | null {
    const id = this.codes.get(code);
    return id ? (this.rooms.get(id) ?? null) : null;
  }

  /**
   * A sala que está jogando — ou acabou de jogar — uma dada rodada.
   *
   * Varredura linear sobre no máximo `MAX_ROOMS` entradas, e roda uma vez por
   * id numa requisição de histórico. Um índice por rodada teria que ser mantido
   * em dia a cada revanche por ganho nenhum que dê pra medir.
   */
  byRound(roundId: string): Room | null {
    for (const room of this.rooms.values()) {
      if (room.roundId === roundId) return room;
    }
    return null;
  }

  hasCode(code: string): boolean {
    return this.codes.has(code);
  }

  /** Toda sala, pras varreduras que perguntam idade e não identidade. */
  all(): Room[] {
    return [...this.rooms.values()];
  }

  remove(id: string): void {
    const room = this.rooms.get(id);
    if (!room) return;
    this.clearTimers(id);
    this.codes.delete(room.inviteCode);
    this.rooms.delete(id);
    // Os ouvintes são avisados de que a sala acabou em vez de largados
    // calados. Sala terminada mantém os streams abertos pra revanche alcançar
    // as duas abas, o que faz deste o momento em que esses streams não têm mais
    // o que esperar — e stream pendurado numa sala que não existe é conexão que
    // ninguém fecha nunca.
    const set = this.listeners.get(id);
    this.listeners.delete(id);
    if (!set) return;
    for (const watcher of set) watcher.end();
  }

  /**
   * Começa a escutar uma sala. A função devolvida para.
   *
   * O fan-out é um Set de callbacks e não um Subject do rxjs por sala porque o
   * controller já é dono do Observable que entrega ao Nest, e duas camadas de
   * gerência de inscrição seriam só dois lugares pra vazar.
   *
   * `end` é chamado quando a sala é removida, pro chamador fechar o que estiver
   * segurando. É opcional: os testes que só querem os eventos não têm nada pra
   * fechar.
   */
  subscribe(
    id: string,
    listener: (event: MatchEvent) => void,
    end: () => void = () => undefined,
  ): () => void {
    const watcher: Watcher = { next: listener, end };
    const set = this.listeners.get(id) ?? new Set<Watcher>();
    set.add(watcher);
    this.listeners.set(id, set);

    return () => {
      const current = this.listeners.get(id);
      if (!current) return;
      current.delete(watcher);
      if (current.size === 0) this.listeners.delete(id);
    };
  }

  /** Quantas conexões estão observando. Zero quer dizer que as duas abas sumiram. */
  watchers(id: string): number {
    return this.listeners.get(id)?.size ?? 0;
  }

  publish(id: string, event: MatchEvent): void {
    const set = this.listeners.get(id);
    if (!set) return;
    for (const watcher of set) watcher.next(event);
  }

  /**
   * Agenda algo pra esta sala, substituindo o que estivesse armado com o mesmo
   * nome.
   *
   * Com nome em vez de anônimo pra rearmar ser idempotente: um segundo jogador
   * entrando duas vezes, ou um tempo de graça recalculado, não pode deixar dois
   * timers correndo pra resolver o mesmo duelo.
   */
  arm(id: string, name: string, at: number, fire: () => void): void {
    const room = this.timers.get(id) ?? new Map<string, NodeJS.Timeout>();
    const existing = room.get(name);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(fire, Math.max(0, at - Date.now()));
    // Sem referência pra um timer de duelo pendente não segurar o processo — ou
    // o runner de teste — aberto além do trabalho pelo qual ele existe.
    timer.unref?.();
    room.set(name, timer);
    this.timers.set(id, room);
  }

  disarm(id: string, name: string): void {
    const room = this.timers.get(id);
    const timer = room?.get(name);
    if (!timer) return;
    clearTimeout(timer);
    room!.delete(name);
  }

  clearTimers(id: string): void {
    const room = this.timers.get(id);
    if (!room) return;
    for (const timer of room.values()) clearTimeout(timer);
    this.timers.delete(id);
  }

  onModuleDestroy(): void {
    for (const id of [...this.rooms.keys()]) this.clearTimers(id);
    this.rooms.clear();
    this.codes.clear();
    for (const set of this.listeners.values()) {
      for (const watcher of set) watcher.end();
    }
    this.listeners.clear();
  }
}
