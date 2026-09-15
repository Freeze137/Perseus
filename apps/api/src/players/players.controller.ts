import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  CreatePlayerSchema,
  RecoverPlayerSchema,
  type Identity,
  type PlayerCredentials,
} from '@perseus/contracts';
import type { Request } from 'express';
import { RateLimit } from '../rate-limit.guard';
import { parse } from '../validation';
import { PassportGuard } from './passport.guard';
import { PlayersService } from './players.service';

@Controller('players')
export class PlayersController {
  constructor(private readonly players: PlayersService) {}

  /**
   * Cria uma identidade.
   *
   * Orçamento apertado por endereço: criar identidade é barato pra quem faz uma
   * vez e é exatamente o que alguém automatizaria pra encher o board de nomes.
   * Cinco por hora é mais do que qualquer pessoa precisa e menos do que um
   * script quer.
   */
  @Post()
  @RateLimit({ limit: 5, windowMs: 3_600_000 })
  async create(@Body() body: unknown): Promise<PlayerCredentials> {
    const payload = parse(CreatePlayerSchema, body);
    return this.players.create(payload.username);
  }

  /**
   * Troca o código de recuperação por um passaporte novo.
   *
   * O orçamento mais apertado da API, e é aqui que ele importa: seis palavras
   * são 66 bits, o que não se adivinha, mas uma rota de recuperação sem limite
   * é o único lugar do sistema onde tentar muitas vezes teria alguma graça.
   */
  @Post('recover')
  @RateLimit({ limit: 10, windowMs: 3_600_000 })
  async recover(@Body() body: unknown): Promise<PlayerCredentials> {
    const payload = parse(RecoverPlayerSchema, body);
    return this.players.recover(payload.code);
  }

  /** O cartão de identidade de quem está com o passaporte na mão. */
  @Get('me')
  @UseGuards(PassportGuard)
  @RateLimit({ limit: 120, windowMs: 60_000 })
  async me(@Req() request: Request): Promise<Identity> {
    return this.players.identity(request.playerId!);
  }
}
