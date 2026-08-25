import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Sse,
  type MessageEvent,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import {
  CreateMatchSchema,
  InviteCodeSchema,
  JoinMatchSchema,
  MatchProgressSchema,
  ReseedMatchSchema,
  MatchSummariesQuerySchema,
  SubmitMatchRunSchema,
  type Match,
  type MatchCredentials,
  type MatchEvent,
  type MatchSummariesResponse,
} from '@perseus/contracts';
import { RateLimit } from '../rate-limit.guard';
import { parse } from '../validation';
import { MatchesService } from './matches.service';

/**
 * De quanto em quanto tempo o stream manda alguma coisa num duelo quieto.
 *
 * Proxy e load balancer fecham conexão ociosa, e um lobby esperando o segundo
 * jogador é ocioso por definição. Vai como evento com nome pra não cair no
 * `onmessage` de ninguém.
 */
const PING_MS = 20_000;

@Controller('matches')
export class MatchesController {
  constructor(private readonly matches: MatchesService) {}

  /**
   * Abre uma sala. Barato de chamar e fácil de scriptar, daí o orçamento
   * apertado: vinte salas por minuto é mais duelo do que se joga numa hora.
   */
  @Post()
  @RateLimit({ limit: 20, windowMs: 60_000 })
  create(@Body() body: unknown): MatchCredentials {
    return this.matches.create(parse(CreateMatchSchema, body));
  }

  /**
   * O que tem atrás de um código de convite, antes de escolher um nome.
   *
   * Declarada acima das rotas `:id` porque o Nest casa na ordem de declaração e
   * senão 'code' seria lido como id de partida.
   */
  @Get('code/:code')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  preview(@Param('code') code: string): Match {
    return this.matches.preview(parse(InviteCodeSchema, code));
  }

  @Post('code/:code/join')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  join(@Param('code') code: string, @Body() body: unknown): MatchCredentials {
    return this.matches.join(
      parse(InviteCodeSchema, code),
      parse(JoinMatchSchema, body),
    );
  }

  /**
   * Os duelos que este browser diz serem dele.
   *
   * É POST porque o pedido é uma lista de ids e não um filtro, e uma query
   * string com cinquenta uuid é uma URL que ninguém quer logar. Ela lê, e está
   * declarada antes de `:id` pelo motivo de ordem acima.
   */
  @Post('history')
  @HttpCode(HttpStatus.OK)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async history(@Body() body: unknown): Promise<MatchSummariesResponse> {
    const query = parse(MatchSummariesQuerySchema, body);
    return this.matches.summaries(query.ids);
  }

  /** The room, for a tab that has just reloaded and still holds its token. */
  @Get(':id')
  @RateLimit({ limit: 60, windowMs: 60_000 })
  mine(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Query('token') token: string | undefined,
  ): { match: Match; slot: number } {
    return this.matches.forPlayer(id, bearer(authorization) ?? token);
  }

  /**
   * O duelo acontecendo: mudança de estado e o cursor do outro jogador.
   *
   * Server-sent events em vez de socket. O tráfego é de mão única — tudo que o
   * cliente tem a dizer é requisição que ele já faz — e SSE sobrevive a proxy
   * reverso comum sem dança de upgrade, reconecta sozinho e não custa
   * dependência. O preço é o token: `EventSource` não seta header, então ele
   * viaja na query string, que é por que o logger de requisição o esconde.
   *
   * O stream é autorizado antes de o observable existir, pra token ruim ser um
   * 401 comum em vez de erro dentro de um stream já aberto.
   *
   * Duelo terminado não encerra o stream. Encerrava, e é exatamente isso que a
   * revanche precisa: o voto é publicado na mesma sala, e as duas telas têm que
   * ouvir — a que pediu e a que está sendo perguntada. O que encerra o stream é
   * a sala ser removida, minutos depois, quando não há mais o que dizer. Duelo
   * abandonado é a exceção: ninguém vai voltar pra ele.
   */
  @Sse(':id/stream')
  stream(
    @Param('id') id: string,
    @Query('token') token: string | undefined,
  ): Observable<MessageEvent> {
    // Lança antes de qualquer header ser escrito se isto não é um jogador.
    this.matches.forPlayer(id, token);

    return new Observable<MessageEvent>((subscriber) => {
      const { unsubscribe, match } = this.matches.subscribe(
        id,
        token,
        (event: MatchEvent) => {
          subscriber.next({ data: event });
          if (event.type === 'match' && event.match.state === 'abandoned') {
            subscriber.complete();
          }
        },
        () => subscriber.complete(),
      );

      // O estado atual primeiro, pra aba que chega tarde ou reconecta nunca
      // ficar esperando a próxima coisa acontecer pra saber o que está rolando.
      subscriber.next({ data: { type: 'match', match } satisfies MatchEvent });

      const ping = setInterval(
        () => subscriber.next({ type: 'ping', data: '' }),
        PING_MS,
      );

      return () => {
        clearInterval(ping);
        unsubscribe();
      };
    });
  }

  /**
   * Uma posição de cursor. Respondida com 204 e mais nada — cinco destas por
   * segundo por jogador não é lugar de serializar uma sala.
   */
  @Post(':id/progress')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RateLimit({ limit: 900, windowMs: 60_000 })
  progress(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): void {
    const payload = parse(MatchProgressSchema, body);
    this.matches.progress(id, bearer(authorization), payload.index);
  }

  /**
   * Sorteia outro texto pra sala, opcionalmente com outro tamanho.
   *
   * O botão de quem criou, no lobby. Orçamento generoso — escolher um texto são
   * alguns cliques seguidos enquanto alguém lê a primeira linha e diz "não
   * esse" — e ainda assim bem abaixo do que um script iria querer.
   */
  @Post(':id/text')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  reseed(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Match {
    return this.matches.reseed(
      id,
      bearer(authorization),
      parse(ReseedMatchSchema, body),
    );
  }

  /**
   * Pede outra rodada na mesma sala.
   *
   * Responde com a sala nos dois casos, porque as duas respostas são telas
   * diferentes: uma diz que está esperando o outro, a outra é uma contagem
   * regressiva. Qual delas voltou se lê no estado.
   */
  @Post(':id/rematch')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  rematch(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
  ): Match {
    return this.matches.rematch(id, bearer(authorization));
  }

  /**
   * Encerra o duelo do lado deste jogador.
   *
   * Mesmo orçamento de terminar: os dois são ações de uma vez por duelo, e
   * vinte por minuto é muito mais duelo do que se joga e muito menos do que um
   * script quer. Responde com a sala resolvida em vez de 204, pra aba que
   * apertou o botão desenhar o fim em vez de pedir de novo.
   */
  @Post(':id/leave')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  leave(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
  ): Match {
    return this.matches.leave(id, bearer(authorization));
  }

  /** The finished timeline, scored the same way a solo run is. */
  @Post(':id/finish')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  finish(
    @Param('id') id: string,
    @Headers('authorization') authorization: string | undefined,
    @Body() body: unknown,
  ): Match {
    return this.matches.finish(
      id,
      bearer(authorization),
      parse(SubmitMatchRunSchema, body),
    );
  }
}

/**
 * O token do duelo, tirado do header Authorization.
 *
 * Toda chamada que dá pra fazer com `fetch` o carrega aqui e não na query
 * string: URL é logada, fica no histórico e é entregue pro que a página linkar
 * em seguida, e este token autoriza digitar no nome de alguém. O stream é a
 * exceção, porque `EventSource` não tem como mandar header.
 */
function bearer(header: string | undefined): string | undefined {
  if (!header?.startsWith('Bearer ')) return undefined;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : undefined;
}
