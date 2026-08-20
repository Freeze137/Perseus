import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MATCH_PLAYERS } from '@perseus/contracts';
import { serverSecret } from '../signing';

/**
 * Proof that you are one of the two people in a room, rather than someone who
 * read the invite code over a shoulder.
 *
 * The code is the door and this is the key. An invite is a six-character string
 * that gets pasted into group chats and read out loud, so it cannot also be the
 * thing that authorises publishing progress and submitting a run: anybody
 * holding it could then type in either player's name. Joining is what mints the
 * token, and joining is only possible while the room has a free slot.
 *
 * Stateless, like the run ticket and for the same reason — the signature is the
 * state, so a restart costs the rooms it was already going to cost and no
 * sweeping is required. Deterministic per match and slot rather than carrying a
 * nonce: the same person reloading their tab has to be able to come back with
 * the token they already stored.
 */
@Injectable()
export class MatchTokenService {
  private readonly secret: Buffer = serverSecret();

  issue(matchId: string, slot: number): string {
    return `${slot}.${this.sign(matchId, slot)}`;
  }

  /**
   * Returns the slot the token speaks for, or null.
   *
   * Null covers every failure the same way on purpose — forged, malformed, or
   * minted for another room. Telling them apart is only useful to whoever is
   * trying them.
   */
  verify(matchId: string, token: string | undefined | null): number | null {
    if (!token) return null;

    const [rawSlot, signature] = token.split('.');
    const slot = Number(rawSlot);
    if (!Number.isInteger(slot) || slot < 1 || slot > MATCH_PLAYERS)
      return null;
    if (!signature) return null;

    const given = Buffer.from(signature, 'hex');
    const mine = Buffer.from(this.sign(matchId, slot), 'hex');
    if (given.length !== mine.length || !timingSafeEqual(given, mine)) {
      return null;
    }
    return slot;
  }

  private sign(matchId: string, slot: number): string {
    // 'match' rather than 'run': the same key signs both, and the label is what
    // stops a valid signature from one being a valid signature for the other.
    return createHmac('sha256', this.secret)
      .update(`match:${matchId}:${slot}`)
      .digest('hex');
  }
}
