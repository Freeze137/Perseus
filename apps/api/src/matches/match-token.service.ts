import { Injectable } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { MATCH_PLAYERS } from '@perseus/contracts';
import { serverSecret } from '../signing';

/**
 * A prova de que você é uma das duas pessoas da sala, e não alguém que leu o
 * código de convite por cima do ombro.
 *
 * O código é a porta e isto é a chave. Um convite é uma string de seis
 * caracteres que é colada em grupo de mensagem e lida em voz alta, então não
 * pode ser também o que autoriza publicar progresso e enviar corrida: quem
 * segurasse poderia digitar no nome de qualquer um dos dois. Entrar é o que
 * cunha o token, e entrar só é possível enquanto a sala tem lugar vago.
 *
 * Sem estado, como o bilhete de corrida e pelo mesmo motivo — a assinatura é o
 * estado, então um restart custa as salas que já ia custar e não precisa de
 * varredura. Determinístico por partida e lugar em vez de carregar um nonce: a
 * mesma pessoa recarregando a aba tem que conseguir voltar com o token que já
 * guardou.
 */
@Injectable()
export class MatchTokenService {
  private readonly secret: Buffer = serverSecret();

  issue(matchId: string, slot: number): string {
    return `${slot}.${this.sign(matchId, slot)}`;
  }

  /**
   * Devolve o lugar por quem o token fala, ou null.
   *
   * Null cobre toda falha do mesmo jeito de propósito — forjado, malformado, ou
   * cunhado pra outra sala. Distinguir só é útil pra quem está tentando.
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
    // 'match' e não 'run': a mesma chave assina os dois, e o rótulo é o que
    // impede uma assinatura válida de um valer para o outro.
    return createHmac('sha256', this.secret)
      .update(`match:${matchId}:${slot}`)
      .digest('hex');
  }
}
