import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomInt, randomUUID } from 'node:crypto';
import {
  CORPUS_VERSION,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_LENGTH,
  MATCH_COUNTDOWN_MS,
  MATCH_GRACE_MS,
  MATCH_LOBBY_TTL_MS,
  MATCH_MAX_RUN_MS,
  MATCH_PLAYERS,
  type CreateMatch,
  type JoinMatch,
  type Match,
  type ReseedMatch,
  type MatchCredentials,
  type MatchErrorCode,
  type MatchSummariesResponse,
  type MatchSummary,
  type SessionConfig,
  type SubmitMatchRun,
} from '@perseus/contracts';
import { generate, randomSeed } from '@perseus/corpus';
import { ResultsService } from '../results/results.service';
import {
  MAX_ROOMS,
  MatchRegistryService,
  type Room,
  type RoomPlayer,
} from './match-registry.service';
import { MatchStoreService } from './match-store.service';
import { MatchTokenService } from './match-token.service';

/**
 * Quanto tempo uma sala terminada fica na memória depois de pontuada.
 *
 * O bastante pros dois lerem o placar, recarregarem a aba e copiarem o link —
 * e, quando não há banco, o bastante pra lista de histórico ter o que mostrar
 * do duelo que acabou de acontecer.
 */
const KEEP_AFTER_DONE_MS = 5 * 60_000;

/** Sala que morreu antes de alguém digitar vale ainda menos tempo que isso. */
const KEEP_AFTER_ABANDONED_MS = 60_000;

/**
 * O duelo: a sala, o relógio, e quem ganhou.
 *
 * Tudo aqui é memória de um processo mais uma escrita no fim. O que ele *não*
 * faz é pontuar coisa nenhuma: duelo é pontuado pelo mesmo
 * `ResultsService.score` por onde passa a corrida solo, reproduzindo a timeline
 * de cada jogador contra o texto que a semente regera. É por isso que o
 * progresso ao vivo pode ser relaxado quanto a perder pacote: ele decora, e o
 * resultado vem de um lugar que o cliente não alcança.
 *
 * A ordem dos eventos, já que ela está espalhada por quatro métodos e um timer:
 *
 *   create   quem cria abre a sala        → 'lobby'
 *   join     o amigo usa o código         → 'countdown', starts_at setado
 *   (timer)  a regressiva acaba           → 'running', teclas destravam
 *   finish   alguém chega ao fim          → começa o tempo de graça do outro
 *   settle   os dois, ou graça vencida    → 'done', vencedor decidido, anotado
 */
@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    private readonly registry: MatchRegistryService,
    private readonly tokens: MatchTokenService,
    private readonly store: MatchStoreService,
    private readonly results: ResultsService,
  ) {}

  /**
   * Abre uma sala e põe quem criou no lugar 1.
   *
   * A semente é sorteada aqui, não aceita de quem cria. Um cliente que a
   * escolhesse poderia gerar o texto, digitar uma vez com cronômetro e abrir a
   * sala já sabendo cada caractere — o que não é fraudar a pontuação, é fraudar
   * a outra pessoa.
   */
  create(payload: CreateMatch): MatchCredentials {
    if (this.registry.size >= MAX_ROOMS) {
      throw new ServiceUnavailableException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'too many duels are open right now — try again in a minute',
      });
    }

    const config: SessionConfig = {
      language: payload.language,
      kind: payload.kind,
      length: payload.length,
      seed: randomSeed(),
      durationMs: null,
      syntax: payload.kind === 'code' ? (payload.syntax ?? 'mix') : null,
      keyboardLayout: payload.keyboardLayout,
    };

    // Recusado aqui e não na regressiva: sala cuja config não produz texto
    // deixaria duas pessoas olhando uma tela vazia com o relógio já andando.
    if (generate(config).length === 0) {
      throw new BadRequestException('that configuration produces no text');
    }

    const now = Date.now();
    const room: Room = {
      id: randomUUID(),
      roundId: randomUUID(),
      inviteCode: this.freshCode(),
      config,
      corpusVersion: CORPUS_VERSION,
      createdAt: now,
      state: 'lobby',
      startsAt: null,
      graceEndsAt: null,
      finishedAt: null,
      winnerSlot: null,
      players: [player(1, payload.displayName, now)],
    };

    this.registry.add(room);
    // Sala em que ninguém entra é varrida em vez de ficar segurando um código.
    this.registry.arm(room.id, 'lobby', now + MATCH_LOBBY_TTL_MS, () => {
      if (room.state === 'lobby') this.registry.remove(room.id);
    });

    return {
      match: this.snapshot(room, now),
      slot: 1,
      token: this.tokens.issue(room.id, 1),
    };
  }

  /** A sala atrás de um código de convite, pra tela que pede um nome. */
  preview(code: string): Match {
    const room = this.registry.byCode(code);
    if (!room) throw this.gone();
    return this.snapshot(room);
  }

  /**
   * Põe o segundo jogador dentro e começa a regressiva.
   *
   * Não existe botão de "pronto". Os dois clientes já têm o texto — ele é função
   * pura da semente que os dois receberam — então a única coisa que falta
   * combinar é quando começar, e uma regressiva diz isso melhor que um botão que
   * uma das pessoas esquece de apertar.
   */
  join(code: string, payload: JoinMatch): MatchCredentials {
    const room = this.registry.byCode(code);
    if (!room) throw this.gone();

    if (room.state !== 'lobby') {
      throw new ConflictException({
        code: (room.players.length >= MATCH_PLAYERS
          ? 'match_full'
          : 'match_closed') satisfies MatchErrorCode,
        message:
          room.players.length >= MATCH_PLAYERS
            ? 'this duel already has two players'
            : 'this duel is no longer open',
      });
    }

    const now = Date.now();
    const slot = MATCH_PLAYERS;
    room.players.push(player(slot, payload.displayName, now));
    room.state = 'countdown';
    room.startsAt = now + MATCH_COUNTDOWN_MS;

    this.registry.disarm(room.id, 'lobby');
    this.registry.arm(room.id, 'start', room.startsAt, () => {
      if (room.state !== 'countdown') return;
      room.state = 'running';
      this.publish(room);
    });
    // O único caso que o tempo de graça não fecha: as duas abas somem antes de
    // alguém terminar, então o relógio que resolveria o duelo nunca começa.
    // Este é o muro atrás disso.
    this.registry.arm(room.id, 'max', room.startsAt + MATCH_MAX_RUN_MS, () =>
      this.settle(room),
    );

    this.publish(room);

    return {
      match: this.snapshot(room, now),
      slot,
      token: this.tokens.issue(room.id, slot),
    };
  }

  /**
   * Sorteia outro texto pra sala.
   *
   * É de quem criou, e só enquanto as teclas ainda estão travadas. Com o duelo
   * rodando, o texto é o que os dois estão digitando; depois que acaba, é
   * contra o que as pontuações foram medidas — mudar em qualquer um dos dois
   * estados reescreveria algo que já aconteceu.
   *
   * `length` é opcional porque as duas coisas que o botão oferece são o mesmo
   * gesto: "outro texto" e "outro texto, maior".
   */
  reseed(id: string, token: string | undefined, payload: ReseedMatch): Match {
    const { room, slot } = this.authorise(id, token);

    if (slot !== 1) {
      throw new UnauthorizedException({
        code: 'match_token' satisfies MatchErrorCode,
        message: 'only the host draws the text',
      });
    }

    if (room.state !== 'lobby') {
      throw new ConflictException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'the text is fixed once the duel starts',
      });
    }

    const config: SessionConfig = {
      ...room.config,
      length: payload.length ?? room.config.length,
      seed: randomSeed(),
    };

    // Mesma guarda da criação, pelo mesmo motivo: configuração que não produz
    // texto deixaria duas pessoas olhando uma tela vazia.
    if (generate(config).length === 0) {
      throw new BadRequestException('that configuration produces no text');
    }

    room.config = config;
    this.publish(room);
    return this.snapshot(room);
  }

  /**
   * Pede outra rodada, e começa uma quando os dois pediram.
   *
   * A sala é mantida — mesmo código, mesmo link, mesmas duas pessoas — e o que
   * é sorteado de novo é a rodada: id novo, pro duelo que acabou de acontecer
   * manter a linha dele no histórico, e semente nova, pra ninguém digitar um
   * texto que já viu.
   *
   * Voto dado não é retirado. A janela são os cinco minutos em que a sala
   * terminada é guardada, e dentro dela a única coisa que pode acontecer é o
   * outro concordar.
   */
  rematch(id: string, token: string | undefined): Match {
    const { room, player: me } = this.authorise(id, token);

    if (room.state !== 'done') {
      throw new ConflictException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'a rematch is offered after the duel, not during it',
      });
    }

    // Quem saiu não está lá pra jogar de novo, e a sala começaria uma
    // regressiva contra uma cadeira vazia.
    if (room.players.length < MATCH_PLAYERS) {
      throw new ConflictException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'the other player has left',
      });
    }

    me.rematch = true;

    if (!room.players.every((one) => one.rematch)) {
      // Meia revanche: a outra tela fica sabendo que estão esperando por ela.
      this.publish(room);
      return this.snapshot(room);
    }

    const now = Date.now();

    room.roundId = randomUUID();
    room.config = { ...room.config, seed: randomSeed() };
    room.state = 'countdown';
    room.startsAt = now + MATCH_COUNTDOWN_MS;
    room.graceEndsAt = null;
    room.finishedAt = null;
    room.winnerSlot = null;

    for (const one of room.players) {
      one.progress = 0;
      one.finishedAt = null;
      one.score = null;
      one.outcome = null;
      one.rematch = false;
    }

    // A sala estava de saída; em vez disso vai ser jogada de novo.
    this.registry.disarm(room.id, 'reap');

    this.registry.arm(room.id, 'start', room.startsAt, () => {
      if (room.state !== 'countdown') return;
      room.state = 'running';
      this.publish(room);
    });
    this.registry.arm(room.id, 'max', room.startsAt + MATCH_MAX_RUN_MS, () =>
      this.settle(room),
    );

    this.publish(room);
    return this.snapshot(room, now);
  }

  /**
   * A sala como um dos jogadores dela vê. Também é o que uma aba reconectando
   * pede: o token ficou guardado localmente, então recarregar no meio do duelo
   * volta pra sala em vez de recomeçar.
   */
  forPlayer(
    id: string,
    token: string | undefined,
  ): { match: Match; slot: number } {
    const { room, slot } = this.authorise(id, token);
    return { match: this.snapshot(room), slot };
  }

  /**
   * Sai do duelo, e leva a sala junto.
   *
   * Duelo é duas pessoas por definição, então um saindo não deixa um duelo pra
   * trás: encerra um. É por isso que isto resolve a sala em vez de remover um
   * jogador dela — seja qual for o estado, a outra pessoa recebe uma tela
   * dizendo que acabou em vez de uma barra que parou de andar.
   *
   * O `settle` decide o que "acabou" quer dizer, e ele já sabe: se alguém tinha
   * terminado, o duelo é pontuado como está e quem saiu é quem não chegou ao
   * fim; se ninguém tinha, a sala é abandonada e nada é registrado. De propósito
   * não existe um segundo jeito de fechar sala aqui.
   *
   * Sair de um duelo que já acabou não é erro. Uma aba que perdeu o stream, viu
   * o placar tarde e só então apertou o botão está pedindo uma coisa que já
   * aconteceu.
   */
  leave(id: string, token: string | undefined): Match {
    const { room } = this.authorise(id, token);
    if (room.state !== 'done' && room.state !== 'abandoned') this.settle(room);
    return this.snapshot(room);
  }

  /**
   * Publica uma posição de cursor pro outro jogador.
   *
   * Ignorado calado fora de um duelo rodando, em vez de recusado. Senão um
   * cliente no meio de um flush quando o tempo de graça vence receberia erro
   * por fazer exatamente o que mandaram, sobre uma mensagem que não importa.
   */
  progress(id: string, token: string | undefined, index: number): void {
    const { room, player: me } = this.authorise(id, token);
    if (room.state !== 'running') return;
    if (me.finishedAt !== null) return;

    // Monotônico: pacote atrasado não pode fazer a barra de alguém andar pra trás.
    if (index <= me.progress) return;
    me.progress = index;

    this.registry.publish(room.id, {
      type: 'progress',
      slot: me.slot,
      index,
      serverNow: Date.now(),
    });
  }

  /**
   * Pega a timeline de um jogador, pontua, e decide se o duelo acabou.
   *
   * A timeline é julgada pelo mesmo código por onde passa um envio solo —
   * reproduzida contra o texto regerado, checada por ritmo humano, e limitada
   * por um relógio que é do servidor. `startsAt` é esse relógio aqui: a corrida
   * não pode ter durado mais que o tempo desde as teclas destravarem.
   */
  finish(
    id: string,
    token: string | undefined,
    payload: SubmitMatchRun,
  ): Match {
    const { room, player: me } = this.authorise(id, token);

    if (room.state === 'countdown') {
      throw new BadRequestException({
        code: 'not_started' satisfies MatchErrorCode,
        message: 'the duel has not started yet',
      });
    }
    if (room.state !== 'running') {
      throw new ConflictException({
        code: 'match_closed' satisfies MatchErrorCode,
        message: 'this duel is already over',
      });
    }
    if (me.finishedAt !== null) {
      throw new ConflictException({
        code: 'already_finished' satisfies MatchErrorCode,
        message: 'you already submitted this duel',
      });
    }

    const now = Date.now();
    const scored = this.results.score(
      {
        config: room.config,
        corpusVersion: room.corpusVersion,
        keystrokes: payload.keystrokes,
      },
      // Não-nulo: `running` só é alcançado pelo timer da regressiva.
      { issuedAt: room.startsAt!, now },
    );

    me.finishedAt = now;
    me.score = {
      wpm: scored.wpm,
      cpm: scored.cpm,
      accuracy: scored.accuracy,
      consistency: scored.consistency,
      durationMs: scored.durationMs,
    };
    me.progress = Math.max(me.progress, scored.correct + scored.incorrect);

    const others = room.players.filter((other) => other.slot !== me.slot);
    const waiting = others.filter((other) => other.finishedAt === null);

    if (waiting.length === 0) {
      this.settle(room);
      return this.snapshot(room);
    }

    // Primeiro a chegar. O outro ganha o tempo de graça e nem um segundo a
    // mais: a alternativa é uma aba fechada segurando a sala aberta pra sempre.
    room.graceEndsAt = now + MATCH_GRACE_MS;
    this.registry.arm(room.id, 'grace', room.graceEndsAt, () =>
      this.settle(room),
    );
    this.publish(room);
    return this.snapshot(room);
  }

  /**
   * Encerra o duelo e descobre quem ganhou.
   *
   * Dois chegaram: o maior ppm, que num texto compartilhado é a mesma coisa que
   * chegar primeiro, calculado da timeline e não de qual requisição chegou
   * antes. Um chegou: ele ganha, e o outro é 'unfinished' — não chegou ao fim
   * do texto dentro do tempo de graça, que é tudo que se afirma sobre ele.
   * Ninguém: a sala morreu, e nada é registrado, porque nada aconteceu.
   */
  private settle(room: Room): void {
    if (room.state === 'done' || room.state === 'abandoned') return;

    const finished = room.players.filter((one) => one.score !== null);
    const now = Date.now();

    this.registry.disarm(room.id, 'grace');
    this.registry.disarm(room.id, 'max');
    this.registry.disarm(room.id, 'start');

    if (finished.length === 0) {
      room.state = 'abandoned';
      room.finishedAt = now;
      for (const one of room.players) one.outcome = 'abandoned';
      this.publish(room);
      this.reap(room, KEEP_AFTER_ABANDONED_MS);
      return;
    }

    room.state = 'done';
    room.finishedAt = now;

    if (finished.length === 1) {
      const winner = finished[0];
      room.winnerSlot = winner.slot;
      winner.outcome = 'won';
      for (const one of room.players) {
        if (one.slot !== winner.slot) one.outcome = 'unfinished';
      }
    } else {
      const [first, second] = [...finished].sort(
        (a, b) => (b.score?.wpm ?? 0) - (a.score?.wpm ?? 0),
      );
      if (first.score!.wpm === second.score!.wpm) {
        // Idêntico até a segunda casa. Raríssimo e não vale quebrar com um
        // critério de desempate cujo raciocínio ninguém enxergaria.
        room.winnerSlot = null;
        for (const one of finished) one.outcome = 'draw';
      } else {
        room.winnerSlot = first.slot;
        first.outcome = 'won';
        second.outcome = 'lost';
      }
    }

    this.publish(room);

    // Uma cópia, não a sala. A escrita é atire e esqueça — os dois jogadores já
    // têm o placar, e guardar é registro e não passo pra produzi-lo — o que
    // significa que ela ainda pode estar em voo quando uma revanche reusar esta
    // sala. Revanche sorteia `roundId` novo e limpa toda pontuação, então
    // entregar o objeto vivo arquivaria o duelo que acabou sob o id do
    // próximo, ou sem pontuação nenhuma.
    const finishedRound: Room = {
      ...room,
      players: room.players.map((one) => ({ ...one })),
    };
    void this.store.save(finishedRound).catch((error: unknown) => {
      this.logger.error(
        `match ${finishedRound.roundId} not stored: ${error instanceof Error ? error.message : String(error)}`,
      );
    });
    this.reap(room, KEEP_AFTER_DONE_MS);
  }

  /**
   * Os duelos que um browser diz serem dele, do mais novo pro mais velho.
   *
   * Sala que ainda está na memória responde por si, e é isso que faz o
   * histórico funcionar quando não há banco: o duelo que acabou de terminar
   * continua aqui. `status` diz de qual desses dois mundos veio a resposta, pra
   * interface poder dizer "não guardado" em vez de "nenhum ainda".
   */
  async summaries(ids: readonly string[]): Promise<MatchSummariesResponse> {
    const stored = await this.store.summaries(ids);
    const byId = new Map(stored.map((match) => [match.id, match]));

    for (const id of ids) {
      if (byId.has(id)) continue;
      // O que o browser guarda é a rodada que ele jogou, que é também o id que
      // a linha carrega. A sala é achada por ele, não o contrário.
      const room = this.registry.byRound(id);
      if (!room || room.state !== 'done') continue;
      byId.set(id, this.summarise(room));
    }

    const matches = [...byId.values()].sort((a, b) =>
      (b.finishedAt ?? '').localeCompare(a.finishedAt ?? ''),
    );

    return { status: this.store.enabled ? 'ok' : 'unavailable', matches };
  }

  /** Inscrever é trabalho do registry; isto está aqui pro controller ter uma
   * dependência em vez de duas. */
  subscribe(
    id: string,
    token: string | undefined,
    listener: Parameters<MatchRegistryService['subscribe']>[1],
    end?: Parameters<MatchRegistryService['subscribe']>[2],
  ): { unsubscribe: () => void; match: Match; slot: number } {
    const { room, slot } = this.authorise(id, token);
    return {
      unsubscribe: this.registry.subscribe(id, listener, end),
      match: this.snapshot(room),
      slot,
    };
  }

  /** A sala e o jogador por quem o token fala, ou uma exceção. */
  private authorise(
    id: string,
    token: string | undefined,
  ): { room: Room; slot: number; player: RoomPlayer } {
    const room = this.registry.byId(id);
    if (!room) throw this.gone();

    const slot = this.tokens.verify(id, token);
    if (slot === null) {
      throw new UnauthorizedException({
        code: 'match_token' satisfies MatchErrorCode,
        message: 'you are not a player in this duel',
      });
    }

    const found = room.players.find((one) => one.slot === slot);
    if (!found) {
      // Token pra um lugar que ninguém ocupa: a sala foi reconstruída, ou o
      // token sobreviveu a ela. De qualquer jeito não é cadeira nesta mesa.
      throw new UnauthorizedException({
        code: 'match_token' satisfies MatchErrorCode,
        message: 'you are not a player in this duel',
      });
    }

    return { room, slot, player: found };
  }

  private publish(room: Room): void {
    this.registry.publish(room.id, {
      type: 'match',
      match: this.snapshot(room),
    });
  }

  private reap(room: Room, after: number): void {
    this.registry.arm(room.id, 'reap', Date.now() + after, () => {
      this.registry.remove(room.id);
    });
  }

  private snapshot(room: Room, now: number = Date.now()): Match {
    return {
      id: room.id,
      roundId: room.roundId,
      inviteCode: room.inviteCode,
      state: room.state,
      config: room.config,
      corpusVersion: room.corpusVersion,
      createdAt: new Date(room.createdAt).toISOString(),
      startsAt: room.startsAt,
      graceEndsAt: room.graceEndsAt,
      finishedAt: room.finishedAt
        ? new Date(room.finishedAt).toISOString()
        : null,
      winnerSlot: room.winnerSlot,
      players: [...room.players]
        .sort((a, b) => a.slot - b.slot)
        .map((one) => ({
          slot: one.slot,
          displayName: one.displayName,
          joinedAt: new Date(one.joinedAt).toISOString(),
          progress: one.progress,
          finishedAt: one.finishedAt
            ? new Date(one.finishedAt).toISOString()
            : null,
          score: one.score,
          outcome: one.outcome,
          rematch: one.rematch,
        })),
      serverNow: now,
    };
  }

  private summarise(room: Room): MatchSummary {
    return {
      // A rodada, batendo com a linha de onde isto teria sido lido se a
      // escrita já tivesse caído. O id da sala seria chave de outro duelo.
      id: room.roundId,
      inviteCode: room.inviteCode,
      kind: room.config.kind,
      language: room.config.language,
      syntax:
        room.config.kind === 'code' ? (room.config.syntax ?? 'mix') : null,
      state: room.state,
      finishedAt: room.finishedAt
        ? new Date(room.finishedAt).toISOString()
        : null,
      winnerSlot: room.winnerSlot,
      players: room.players.map((one) => ({
        slot: one.slot,
        displayName: one.displayName,
        score: one.score,
        outcome: one.outcome,
      })),
    };
  }

  /**
   * Um código de convite não usado.
   *
   * Colisão é checada em vez de descartada como improvável: um bilhão de
   * códigos é muito até duas de duzentas salas vivas dividirem um, e a pessoa a
   * quem isso acontecesse cairia no duelo de um estranho.
   */
  private freshCode(): string {
    for (let attempt = 0; attempt < 32; attempt += 1) {
      let code = '';
      for (let index = 0; index < INVITE_CODE_LENGTH; index += 1) {
        code += INVITE_CODE_ALPHABET[randomInt(INVITE_CODE_ALPHABET.length)];
      }
      if (!this.registry.hasCode(code)) return code;
    }
    // Trinta e duas colisões seguidas não é azar, é tabela cheia.
    throw new ServiceUnavailableException({
      code: 'match_closed' satisfies MatchErrorCode,
      message: 'could not allocate an invite code — try again',
    });
  }

  /** Uma frase pra cada jeito de uma sala estar faltando. */
  private gone(): NotFoundException {
    return new NotFoundException({
      code: 'match_not_found' satisfies MatchErrorCode,
      message: 'this duel does not exist, or it has already ended',
    });
  }
}

function player(slot: number, displayName: string, at: number): RoomPlayer {
  return {
    slot,
    displayName,
    joinedAt: at,
    progress: 0,
    finishedAt: null,
    score: null,
    outcome: null,
    rematch: false,
  };
}
