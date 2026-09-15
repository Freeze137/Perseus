import { Controller, Post } from '@nestjs/common';
import type { RunTicket } from '@perseus/contracts';
import { RateLimit } from '../rate-limit.guard';
import { RunTicketService } from './run-ticket.service';

@Controller('runs')
export class RunsController {
  constructor(private readonly tickets: RunTicketService) {}

  /**
   * Abre uma corrida.
   *
   * Chamado quando o primeiro caractere é digitado, não quando o texto aparece:
   * um bilhete por texto sorteado seria uma requisição a cada Escape de quem
   * está procurando um texto que goste, e o relógio começaria antes da digitação.
   *
   * Aberto, sem identidade. O bilhete não diz de quem é a corrida — diz que
   * este servidor a viu começar, e quando. Quem ela é só é decidido no envio,
   * pelo passaporte, e exigir identidade já aqui impediria alguém sem conta
   * nenhuma de ter a própria corrida pontuada pelo servidor.
   */
  @Post()
  @RateLimit({ limit: 60, windowMs: 60_000 })
  open(): RunTicket {
    return this.tickets.issue();
  }
}
