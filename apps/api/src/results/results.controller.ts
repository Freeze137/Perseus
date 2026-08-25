import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  HistoryQuerySchema,
  LeaderboardQuerySchema,
  SubmitResultSchema,
  type HistoryResponse,
  type LeaderboardResponse,
  type TypingResult,
} from '@perseus/contracts';
import type { Request } from 'express';
import { AuthGuard } from '../auth.guard';
import { HistoryService } from '../history/history.service';
import { LeaderboardService } from '../leaderboard/leaderboard.service';
import { RateLimit } from '../rate-limit.guard';
import { ResultsService } from './results.service';
import { parse } from '../validation';

@Controller()
export class ResultsController {
  constructor(
    private readonly results: ResultsService,
    private readonly leaderboard: LeaderboardService,
    private readonly history: HistoryService,
  ) {}

  /**
   * O orçamento é por pessoa e generoso pelo padrão da digitação: uma corrida
   * leva dezenas de segundos, então 30 por minuto é muito mais do que alguém
   * digita e muito menos do que um script quer.
   */
  @Post('results')
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async submit(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<TypingResult> {
    const payload = parse(SubmitResultSchema, body);
    // Não-nulo: quem pôs ali foi o guard, e o guard lançou no caso contrário.
    return this.results.submit(request.caller!.userId, payload);
  }

  /** Suas corridas, lidas dentro das suas próprias políticas de linha. */
  @Get('results/mine')
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  async mine(
    @Req() request: Request,
    @Query() query: unknown,
  ): Promise<HistoryResponse> {
    return this.history.read(
      request.caller!.accessToken,
      parse(HistoryQuerySchema, query),
    );
  }

  /** Público: ranking que ninguém lê sem conta não é ranking. */
  @Get('leaderboard')
  @RateLimit({ limit: 120, windowMs: 60_000 })
  async board(@Query() query: unknown): Promise<LeaderboardResponse> {
    return this.leaderboard.read(parse(LeaderboardQuerySchema, query));
  }
}
