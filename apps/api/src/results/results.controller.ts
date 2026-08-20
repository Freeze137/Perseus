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
   * The budget is per person and generous by the standards of typing: a run
   * takes tens of seconds, so 30 a minute is far more than anybody types and
   * far less than a script wants.
   */
  @Post('results')
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async submit(
    @Req() request: Request,
    @Body() body: unknown,
  ): Promise<TypingResult> {
    const payload = parse(SubmitResultSchema, body);
    // Non-null: the guard is what put it there, and the guard threw otherwise.
    return this.results.submit(request.caller!.userId, payload);
  }

  /** Your own runs, read inside your own row-level policies. */
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

  /** Public: a board nobody can read without an account is not a board. */
  @Get('leaderboard')
  @RateLimit({ limit: 120, windowMs: 60_000 })
  async board(@Query() query: unknown): Promise<LeaderboardResponse> {
    return this.leaderboard.read(parse(LeaderboardQuerySchema, query));
  }
}
