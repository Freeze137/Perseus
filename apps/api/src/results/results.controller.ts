import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import {
  HistoryQuerySchema,
  LeaderboardQuerySchema,
  SubmitResultSchema,
  type HistoryResponse,
  type LeaderboardResponse,
  type SubmitResponse,
} from '@perseus/contracts';
import type { Request } from 'express';
import { HistoryService } from '../history/history.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { PassportGuard, readPassport } from '../players/passport.guard';
import { PassportService } from '../players/passport.service';
import { RateLimit } from '../rate-limit.guard';
import { parse } from '../validation';
import { ResultsService } from './results.service';

@Controller()
export class ResultsController {
  constructor(
    private readonly results: ResultsService,
    private readonly leaderboard: LeaderboardService,
    private readonly history: HistoryService,
    private readonly passports: PassportService,
  ) {}

  /**
   * Pontua uma corrida. Passaporte opcional.
   *
   * Sem guard de propósito: corrida anônima é pontuada e devolvida como
   * qualquer outra, com as mesmas recusas e os mesmos números, e só não
   * classifica ninguém. Exigir identidade aqui transformaria o treinador — que
   * sempre rodou offline — num produto que pede cadastro pra dizer quanto você
   * digitou.
   *
   * O orçamento é generoso pelo padrão da digitação: uma corrida leva dezenas
   * de segundos, então 30 por minuto é muito mais do que alguém digita e muito
   * menos do que um script quer.
   */
  @Post('results')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async submit(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<SubmitResponse> {
    const payload = parse(SubmitResultSchema, body);
    return this.results.submit(readPassport(request, this.passports), payload);
  }

  /** Suas corridas. O passaporte é o escopo — não há nada mais pra delimitar. */
  @Get('results/mine')
  @UseGuards(PassportGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async mine(
    @Req() request: Request,
    @Query() query: unknown,
  ): Promise<HistoryResponse> {
    return this.history.read(request.playerId!, parse(HistoryQuerySchema, query));
  }

  /** Público: ranking que ninguém lê sem identidade não é ranking. */
  @Get('leaderboard')
  @RateLimit({ limit: 120, windowMs: 60_000 })
  async board(@Query() query: unknown): Promise<LeaderboardResponse> {
    return this.leaderboard.read(parse(LeaderboardQuerySchema, query));
  }
}
