import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  familyOf,
  PATENTE_DORMANT_DAYS,
  PATENTE_MIN_RUNS,
  tierOf,
  type Identity,
  type Patente,
  type Player,
  type PlayerCredentials,
  type RankFamily,
} from '@perseus/contracts';
import { PostgresService } from '../db/postgres.service';
import { hashRecovery, PassportService } from './passport.service';

/** Código de violação de unicidade do Postgres. É como chega um nome tomado. */
const UNIQUE_VIOLATION = '23505';

const MS_PER_DAY = 86_400_000;

type PlayerRow = {
  id: string;
  username: string;
  created_at: Date;
};

type PatenteRow = {
  family: string;
  wpm_avg: string;
  runs_total: number;
  last_run_at: Date;
};

/**
 * Quem é quem no ranking.
 *
 * O produto inteiro já tinha decidido não pedir conta — o duelo pede um nome e
 * mais nada — e isto leva a mesma decisão ao ranking, que era a única parte que
 * ainda pedia e-mail. O que existe no lugar de uma conta são duas chaves: o
 * passaporte, que o navegador guarda e perde junto com os dados do site, e o
 * código de recuperação, que a pessoa guarda e é o que faz a perda do primeiro
 * ser um contratempo em vez de um fim.
 *
 * Nada aqui funciona sem banco e sem segredo configurado, e os dois casos
 * degradam do mesmo jeito que todo o resto degrada neste servidor: dizendo que
 * está desligado, sem derrubar o treinador, que nunca precisou de nenhum dos
 * dois.
 */
@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly db: PostgresService,
    private readonly passports: PassportService,
  ) {}

  get enabled(): boolean {
    return this.db.enabled && this.passports.enabled;
  }

  /**
   * Cria uma identidade e devolve as duas chaves dela.
   *
   * O código de recuperação sai daqui em texto uma única vez na vida desta
   * identidade. O banco recebe só o hash — e é por isso que nem este serviço
   * consegue mostrá-lo de novo depois, o que é a propriedade que se quer.
   */
  async create(username: string): Promise<PlayerCredentials> {
    this.requireEnabled();
    const recovery = this.passports.newRecoveryCode();

    let rows: PlayerRow[];
    try {
      rows = await this.db.query<PlayerRow>(
        `insert into public.players (username, recovery_hash)
         values ($1, $2)
         returning id, username, created_at`,
        [username, recovery.hash],
      );
    } catch (error) {
      if (isUniqueViolation(error)) {
        // Nome tomado não é erro de quem pediu; é uma escolha a refazer, e a
        // interface precisa distinguir isso de "o banco caiu".
        throw new ConflictException({
          code: 'username_taken',
          message: 'esse nome já está em uso',
        });
      }
      throw error;
    }

    const row = rows[0];
    if (!row) throw new ServiceUnavailableException('could not create player');

    return {
      player: toPlayer(row),
      passport: this.passports.issue(row.id),
      recoveryCode: recovery.phrase,
    };
  }

  /**
   * Troca seis palavras por um passaporte novo.
   *
   * A procura é pelo hash, então o código nunca é comparado em texto e nunca
   * precisou estar guardado em texto. Passaporte antigo não é invalidado: os
   * dois navegadores continuam sendo a mesma pessoa, que é o comportamento que
   * alguém espera de "entrar também no PC do trabalho".
   */
  async recover(words: readonly string[]): Promise<PlayerCredentials> {
    this.requireEnabled();
    const rows = await this.db.query<PlayerRow>(
      `update public.players set last_seen_at = now()
       where recovery_hash = $1
       returning id, username, created_at`,
      [hashRecovery(words)],
    );

    const row = rows[0];
    if (!row) {
      throw new NotFoundException({
        code: 'recovery_unknown',
        message: 'esse código não corresponde a nenhuma identidade',
      });
    }

    return {
      player: toPlayer(row),
      passport: this.passports.issue(row.id),
      // Recuperar não sorteia um código novo: o antigo continua sendo o dela, e
      // trocá-lo aqui invalidaria o papel que a pessoa acabou de provar que tem
      // guardado.
      recoveryCode: '',
    };
  }

  /** O cartão de identidade: o nome, as duas patentes, o total de corridas. */
  async identity(playerId: string): Promise<Identity> {
    this.requireEnabled();
    const [players, patentes, totals] = await Promise.all([
      this.db.query<PlayerRow>(
        `select id, username, created_at from public.players where id = $1`,
        [playerId],
      ),
      this.db.query<PatenteRow>(
        `select family, wpm_avg, runs_total, last_run_at
         from public.player_patentes where player_id = $1`,
        [playerId],
      ),
      this.db.query<{ total: string }>(
        `select count(*)::text as total from public.runs where player_id = $1`,
        [playerId],
      ),
    ]);

    const row = players[0];
    if (!row) throw new NotFoundException('unknown player');

    return {
      player: toPlayer(row),
      patentes: patentes.map(toPatente).filter((p) => p !== null),
      totalRuns: Number(totals[0]?.total ?? 0),
    };
  }

  /** Marca presença. Barato e sem transação: é uma data, não um fato do jogo. */
  async touch(playerId: string): Promise<void> {
    if (!this.enabled) return;
    await this.db
      .query(`update public.players set last_seen_at = now() where id = $1`, [
        playerId,
      ])
      .catch((error: unknown) => {
        this.logger.warn(`could not touch player: ${String(error)}`);
        return [];
      });
  }

  private requireEnabled(): void {
    if (this.enabled) return;
    throw new ServiceUnavailableException({
      code: 'ranking_off',
      message: 'o ranking não está ligado neste ambiente',
    });
  }
}

function toPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    username: row.username,
    createdAt: row.created_at.toISOString(),
  };
}

/**
 * Uma linha de patente como a interface a lê — ou null quando ainda não há
 * corridas suficientes pra ela querer dizer alguma coisa.
 *
 * O degrau é calculado aqui, a partir da média e da régua da família, e nunca
 * lido do banco. A régua vive nos contratos, e guardar o degrau junto criaria
 * uma segunda fonte da verdade que passaria a mentir, calada, no dia em que um
 * limiar mudasse.
 */
function toPatente(row: PatenteRow): Patente | null {
  if (row.runs_total < PATENTE_MIN_RUNS) return null;
  const family = row.family as RankFamily;
  const wpm = Number(row.wpm_avg);
  const age = Date.now() - row.last_run_at.getTime();

  return {
    family,
    tier: tierOf(family, wpm),
    wpm,
    runs: row.runs_total,
    lastRunAt: row.last_run_at.toISOString(),
    dormant: age > PATENTE_DORMANT_DAYS * MS_PER_DAY,
  };
}

/** Reexportado pro serviço de ranking classificar sem reimplementar a regra. */
export { familyOf };

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === UNIQUE_VIOLATION
  );
}
