import { Injectable, Optional } from '@nestjs/common';
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { RUN_TICKET_TTL_MS, type RunTicket } from '@perseus/contracts';
import { serverSecret } from '../signing';

export type TicketVerdict =
  | { readonly ok: true; readonly issuedAt: number }
  | { readonly ok: false; readonly reason: string };

/**
 * Assina e confere o papel de permissão com que uma corrida é aberta.
 *
 * Sem estado de propósito: a assinatura é o estado. Uma tabela de bilhetes
 * abertos seria uma linha escrita pra toda corrida que alguém começa e
 * abandona — a maioria delas, num treinador — e precisaria ser varrida. Um HMAC
 * não custa nada, não deixa lixo, e responde a única pergunta que está sendo
 * feita: este servidor entregou este bilhete, e quando.
 *
 * Pra que serve um bilhete é coisa estreita, e vale dizer pra ninguém confiar
 * nele mais do que ele carrega. Não prova que uma pessoa digitou. Dá a toda
 * corrida uma identidade emitida pelo servidor, que é o que torna impossível
 * guardar a mesma duas vezes, e põe um relógio de parede atrás da duração
 * alegada pra um envio não poder dizer que levou mais do que o tempo que de
 * fato passou.
 */
@Injectable()
export class RunTicketService {
  private readonly secret: Buffer;

  /**
   * O segredo é dividido com os tokens de duelo em vez de ser dono aqui — um
   * processo, uma identidade. Um aleatório funciona; só não sobrevive a um
   * restart, então corrida aberta antes de um deploy não pode ser enviada
   * depois. Ver `serverSecret`.
   *
   * É parâmetro pra um teste conseguir fingir ser um segundo deploy, que é o
   * único chamador que passa um.
   */
  constructor(@Optional() secret?: Buffer) {
    // Opcional, e undefined em toda ligação real: senão o Nest procuraria um
    // provider de Buffer e se recusaria a subir. Um teste passa um pra fingir
    // ser um segundo deploy, que é o único chamador que faz isso.
    this.secret = secret ?? serverSecret();
  }

  issue(now: number = Date.now()): RunTicket {
    const id = randomUUID();
    const issuedAt = now;
    return { id, issuedAt, signature: this.sign(id, issuedAt) };
  }

  /**
   * Confere a assinatura, a idade e a direção do relógio.
   *
   * Bilhete vindo do futuro é recusado com a mesma firmeza de um vencido: ou é
   * falsificação ou é servidor com relógio que andou, e os dois fazem toda
   * duração derivada dele não querer dizer nada.
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
    // O rótulo 'run' é o que impede isto de virar um token de duelo, que é
    // assinado com a mesma chave. Separação de domínio custa quatro caracteres
    // e fecha a classe inteira de "assinatura válida, significado errado".
    return createHmac('sha256', this.secret)
      .update(`run:${id}:${issuedAt}`)
      .digest('hex');
  }
}
