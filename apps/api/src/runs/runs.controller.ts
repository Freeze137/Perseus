import { Controller, Post, UseGuards } from '@nestjs/common';
import type { RunTicket } from '@perseus/contracts';
import { AuthGuard } from '../auth.guard';
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
   */
  @Post()
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  open(): RunTicket {
    return this.tickets.issue();
  }
}
