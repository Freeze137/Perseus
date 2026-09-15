import { Injectable, Logger } from '@nestjs/common';
import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import type { Passport } from '@perseus/contracts';
import { loadEnv } from '../config';
import { serverSecret } from '../signing';
import { RECOVERY_WORDS } from './recovery-words';

/** Quantas palavras um código de recuperação tem. Seis são 66 bits. */
const RECOVERY_LENGTH = 6;

/**
 * A criptografia da identidade, e só ela: nada aqui toca banco.
 *
 * Duas coisas moram neste arquivo e é importante que não sejam confundidas,
 * porque têm durabilidades opostas:
 *
 *   **O passaporte** é assinado com o segredo do processo, o mesmo que assina
 *   bilhete de corrida e token de duelo. É conveniência — a prova rápida de que
 *   este navegador é aquela pessoa — e depende do deploy ter um
 *   `RUN_TICKET_SECRET` de verdade. Sem ele o segredo é inventado no boot, e um
 *   passaporte que não sobrevive a um deploy é pior que passaporte nenhum: a
 *   pessoa descobriria a perda no meio de uma corrida. Por isso a identidade
 *   inteira se declara indisponível quando o segredo não está configurado, em
 *   vez de funcionar até o próximo deploy.
 *
 *   **O código de recuperação** é hasheado *sem* nenhum segredo do servidor, e
 *   isso é deliberado. Ele é permanente: se o hash dependesse de uma chave que
 *   pode ser regerada num boot, uma variável de ambiente esquecida apagaria
 *   silenciosamente a única forma de recuperação de todo mundo. O que sustenta
 *   o hash puro é a entropia — 66 bits sorteados por máquina, sem aniversário
 *   nem nome de cachorro dentro, que é o que um KDF existe pra compensar.
 */
@Injectable()
export class PassportService {
  private readonly logger = new Logger(PassportService.name);
  private readonly secret: Buffer;

  /**
   * Se dá pra emitir identidade neste processo.
   *
   * Falso quando `RUN_TICKET_SECRET` não está configurado. O ranking então se
   * comporta como sempre se comportou sem banco: diz que está desligado, e o
   * treinador continua inteiro.
   */
  readonly enabled: boolean;

  constructor() {
    this.secret = serverSecret();
    this.enabled = Boolean(loadEnv().RUN_TICKET_SECRET);
    if (!this.enabled) {
      this.logger.warn(
        'RUN_TICKET_SECRET not set — ranking identity is disabled. A passport signed with a per-boot secret would be silently revoked by the next deploy.',
      );
    }
  }

  issue(playerId: string): Passport {
    return { playerId, signature: this.sign(playerId) };
  }

  /** O id de quem assinou, ou null se este servidor não assinou aquilo. */
  verify(passport: Passport): string | null {
    const expected = Buffer.from(this.sign(passport.playerId), 'hex');
    let given: Buffer;
    try {
      given = Buffer.from(passport.signature, 'hex');
    } catch {
      return null;
    }
    if (given.length !== expected.length) return null;
    if (!timingSafeEqual(given, expected)) return null;
    return passport.playerId;
  }

  /**
   * Sorteia um código novo.
   *
   * `randomInt` e não `Math.random()`: isto é a única chave de uma identidade,
   * e um gerador previsível transformaria 66 bits num número de série.
   *
   * Palavras repetidas são permitidas. Impedir a repetição tiraria entropia e
   * compraria só a impressão de capricho — cada posição continua sendo um
   * sorteio independente de 2048.
   */
  newRecoveryCode(): { phrase: string; hash: string } {
    const words = Array.from(
      { length: RECOVERY_LENGTH },
      () => RECOVERY_WORDS[randomInt(RECOVERY_WORDS.length)]!,
    );
    return { phrase: words.join('-'), hash: hashRecovery(words) };
  }

  private sign(playerId: string): string {
    // O rótulo é o que impede um passaporte de ser lido como bilhete de
    // corrida, já que os dois saem da mesma chave. Ver `signing.ts`.
    return createHmac('sha256', this.secret)
      .update(`passport:${playerId}`)
      .digest('hex');
  }
}

/**
 * O hash pelo qual um código de recuperação é procurado no banco.
 *
 * Função livre e não método porque não depende de nada do processo — é a
 * mesma conta hoje, depois de um deploy e depois de uma troca de segredo. É
 * exatamente essa independência que faz a recuperação sobreviver ao que o
 * passaporte não sobrevive.
 */
export function hashRecovery(words: readonly string[]): string {
  return createHash('sha256')
    .update(`recovery:${words.join(' ')}`)
    .digest('hex');
}
