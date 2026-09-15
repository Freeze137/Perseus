import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { CORPUS_VERSION } from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import { PassportService } from '../players/passport.service';

@Controller('health')
export class HealthController {
  constructor(
    private readonly postgres: PostgresService,
    private readonly passports: PassportService,
  ) {}

  /**
   * Diz o que este build consegue fazer, não só que está de pé.
   *
   * `sync` é o que o site lê pra decidir se oferece identidade e ranking. São
   * duas condições e não uma: um banco pra escrever, e um segredo estável pra
   * assinar passaporte. Faltando qualquer uma, uma API continua perfeitamente
   * boa pra um treinador que funciona offline — e a interface tem que refletir
   * isso em vez de oferecer um botão que falha.
   *
   * Responde da memória. É a sonda de liveness — "este processo está servindo" —
   * e uma sonda de liveness que encosta no banco reinicia uma API saudável toda
   * vez que o banco tem um minuto ruim.
   */
  @Get()
  status() {
    return {
      status: 'ok',
      sync: this.postgres.enabled && this.passports.enabled,
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
   * máximo de poucos em poucos segundos, e devolve 503 quando há banco
   * configurado e ele não responde — o estado em que o processo está vivo e não
   * consegue fazer o trabalho pro qual foi configurado.
   *
   * Um banco só é fonte de degradação depois de existir. Sem `DATABASE_URL` o
   * ranking e o histórico estão desligados por configuração, que é um estado
   * saudável e não uma avaria — o treinador nunca dependeu de nenhum dos dois.
   */
  @Get('ready')
  @HttpCode(HttpStatus.OK)
  async ready() {
    if (!this.postgres.enabled) {
      return {
        status: 'ok',
        sync: false,
        database: 'not configured',
        duelHistory: 'not configured',
      };
    }

    const reachable = await this.postgres.reachable();
    if (!reachable) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        sync: this.passports.enabled,
        database: 'unreachable',
        duelHistory: 'unreachable',
      });
    }

    return {
      status: 'ok',
      sync: this.passports.enabled,
      database: 'reachable',
      duelHistory: 'reachable',
    };
  }
}
