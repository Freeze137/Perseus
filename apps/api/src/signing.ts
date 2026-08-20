import { Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { loadEnv } from './config';

let secret: Buffer | null = null;

/**
 * The one secret this process signs its own paperwork with.
 *
 * Two things are signed here — the ticket a solo run is opened with, and the
 * token that says which side of a duel somebody is playing — and they share a
 * secret on purpose rather than by neglect. Both are short-lived, both are
 * meaningless outside this deployment, and a second environment variable to
 * forget to set would buy nothing: what keeps them from being interchangeable
 * is the label each one puts inside the HMAC, not the key.
 *
 * Without RUN_TICKET_SECRET the process invents one at boot. That works and is
 * the right default for local work — it just does not survive a restart, so
 * runs and duels opened before one are refused after it.
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
