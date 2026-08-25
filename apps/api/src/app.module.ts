import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PostgresModule } from './db/postgres.module';
import { HealthController } from './health/health.controller';
import { HistoryService } from './history/history.service';
import { LeaderboardService } from './leaderboard/leaderboard.service';
import { LoggingInterceptor } from './logging.interceptor';
import { MatchRegistryService } from './matches/match-registry.service';
import { MatchStoreService } from './matches/match-store.service';
import { MatchTokenService } from './matches/match-token.service';
import { MatchesController } from './matches/matches.controller';
import { MatchesService } from './matches/matches.service';
import { RateLimitGuard } from './rate-limit.guard';
import { ResultsController } from './results/results.controller';
import { ResultsService } from './results/results.service';
import { RunTicketService } from './runs/run-ticket.service';
import { RunsController } from './runs/runs.controller';
import { SupabaseModule } from './supabase/supabase.module';

@Module({
  imports: [SupabaseModule, PostgresModule],
  controllers: [
    AppController,
    HealthController,
    MatchesController,
    ResultsController,
    RunsController,
  ],
  providers: [
    AppService,
    ResultsService,
    LeaderboardService,
    HistoryService,
    RunTicketService,
    MatchesService,
    MatchRegistryService,
    MatchStoreService,
    MatchTokenService,
    // Global e não por rota: limitador que você tem que lembrar de pendurar é
    // limitador que falta na rota que alguém adiciona com pressa. O guard não
    // faz nada com rota sem orçamento @RateLimit, então ser global custa uma
    // consulta a um mapa intocado e compra o default ser seguro.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    { provide: APP_INTERCEPTOR, useClass: LoggingInterceptor },
  ],
})
export class AppModule {}
