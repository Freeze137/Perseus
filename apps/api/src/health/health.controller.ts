import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CORPUS_VERSION } from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import { SupabaseService } from '../supabase/supabase.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly postgres: PostgresService,
  ) {}

  /**
   * Diz o que este build consegue fazer, não só que está de pé.
   *
   * `sync` é o que o site lê pra decidir se oferece login: uma API rodando sem
   * credencial de banco é uma API perfeitamente boa pra um treinador que
   * funciona offline, e a interface deve refletir isso em vez de oferecer um
   * botão que falha.
   *
   * Responde da memória. É a sonda de liveness — "este processo está servindo" —
   * e uma sonda de liveness que encosta no banco reinicia uma API saudável toda
   * vez que o banco tem um minuto ruim.
   */
  @Get()
  status() {
    return {
      status: 'ok',
      sync: this.supabase.enabled,
      // Duelo está sempre disponível: a sala vive neste processo. O que isto
      // diz é se um duelo terminado é anotado depois, que é outra promessa e
      // merece palavra própria.
      duels: true,
      duelHistory: this.postgres.enabled,
      corpusVersion: CORPUS_VERSION,
    };
  }

  /**
   * Readiness: se o banco está respondendo agora.
   *
   * Separada da de cima porque são perguntadas por coisas diferentes e por
   * motivos diferentes. Esta custa uma query, então cabe numa sonda que roda no
   * máximo de poucos em poucos segundos, e devolve 503 quando o sync está
   * configurado e não alcançável — o estado em que o processo está vivo e não
   * consegue fazer o trabalho pro qual foi configurado.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready() {
    const duelHistory = this.postgres.enabled
      ? (await this.postgres.reachable())
        ? 'reachable'
        : 'unreachable'
      : 'not configured';

    if (!this.supabase.enabled) {
      // Offline por configuração é estado saudável, não degradado.
      if (duelHistory === 'unreachable') {
        throw new ServiceUnavailableException({
          status: 'degraded',
          sync: false,
          database: 'not configured',
          duelHistory,
        });
      }
      return {
        status: 'ok',
        sync: false,
        database: 'not configured',
        duelHistory,
      };
    }

    const reachable = await this.supabase.reachable();
    if (!reachable || duelHistory === 'unreachable') {
      throw new ServiceUnavailableException({
        status: 'degraded',
        sync: true,
        database: reachable ? 'reachable' : 'unreachable',
        duelHistory,
      });
    }
    return { status: 'ok', sync: true, database: 'reachable', duelHistory };
  }
}
