import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './config';

let secret: Buffer | null = null;

/**
 * O único segredo com que este processo assina os próprios papéis.
 *
 * Duas coisas são assinadas aqui — o bilhete que abre uma corrida solo e o
 * token que diz de que lado do duelo alguém está — e dividem o segredo de
 * propósito, não por desleixo. Os dois são curtos de vida, os dois não querem
 * dizer nada fora deste deploy, e uma segunda variável de ambiente pra esquecer
 * de setar não compraria nada: o que impede um de virar o outro é o rótulo que
 * cada um põe dentro do HMAC, não a chave.
 *
 * Sem RUN_TICKET_SECRET o processo inventa um no boot. Funciona e é o default
 * certo pra trabalho local — só não sobrevive a um restart, então corrida e
 * duelo abertos antes são recusados depois.
 */
export function serverSecret(): Buffer {
  if (secret) return secret;

  const configured = loadEnv().RUN_TICKET_SECRET;
  if (configured) {
    secret = Buffer.from(configured, 'utf8');
    return secret;
  }

  secret = Buffer.from(randomUUID() + randomUUID(), 'utf8');
  new Logger('signing').warn(
    'RUN_TICKET_SECRET not set — signing with a per-process secret. Runs and duels started before a restart will be refused after it.',
  );
  return secret;
}
