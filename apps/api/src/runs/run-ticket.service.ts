import { Injectable, Optional } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { RUN_TICKET_TTL_MS, type RunTicket } from '@perseus/contracts';
import { serverSecret } from '../signing';

export type TicketVerdict =
  | { readonly ok: true; readonly issuedAt: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Signs and checks the permission slip a run is opened with.
 *
 * Stateless on purpose: the signature is the state. A table of open tickets
 * would be a row written for every run anybody starts and abandons — most of
 * them, on a trainer — and would have to be swept. An HMAC costs nothing, keeps
 * no garbage, and answers the only question being asked: did this server hand
 * this ticket out, and when.
 *
 * What a ticket is for is narrow, and worth stating so nobody trusts it with
 * more than it carries. It does not prove a person typed. It gives every run a
 * server-issued identity, which is what makes storing one twice impossible, and
 * it puts a wall clock behind the claimed duration so a submission cannot say
 * it took longer than the time that has actually passed.
 */
@Injectable()
export class RunTicketService {
  private readonly secret: Buffer;

  /**
   * The secret is shared with the duel tokens rather than owned here — one
   * process, one identity. A random one still works; it just does not survive a
   * restart, so runs open before a deploy cannot be submitted after it. See
   * `serverSecret`.
   *
   * It is a parameter so a test can stand in for a second deployment, which is
   * the only caller that ever passes one.
   */
  constructor(@Optional() secret?: Buffer) {
    // Optional, and undefined in every real wiring: Nest would otherwise try to
    // find a Buffer provider and refuse to start. A test passes one to stand in
    // for a second deployment, which is the only caller that ever does.
    this.secret = secret ?? serverSecret();
  }

  issue(now: number = Date.now()): RunTicket {
    const id = randomUUID();
    const issuedAt = now;
    return { id, issuedAt, signature: this.sign(id, issuedAt) };
  }

  /**
   * Checks the signature, the age and the direction of the clock.
   *
   * A ticket from the future is refused as firmly as an expired one: it is
   * either a forgery or a server whose clock moved, and both make every
   * duration derived from it meaningless.
   */
  verify(ticket: RunTicket, now: number = Date.now()): TicketVerdict {
    const expected = this.sign(ticket.id, ticket.issuedAt);
    const given = Buffer.from(ticket.signature, 'hex');
    const mine = Buffer.from(expected, 'hex');

    if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
      return {
        ok: false,
        reason: 'the run ticket is not one this server issued',
      };
    }
    if (ticket.issuedAt > now + 60_000) {
      return { ok: false, reason: 'the run ticket is dated in the future' };
    }
    if (now - ticket.issuedAt > RUN_TICKET_TTL_MS) {
      return { ok: false, reason: 'the run ticket has expired' };
    }
    return { ok: true, issuedAt: ticket.issuedAt };
  }

  private sign(id: string, issuedAt: number): string {
    // The 'run' label is what keeps this from being interchangeable with a duel
    // token, which is signed with the same key. Domain separation costs four
    // characters and closes the whole class of "signature valid, meaning wrong".
    return createHmac('sha256', this.secret)
      .update(`run:${id}:${issuedAt}`)
      .digest('hex');
  }
}
