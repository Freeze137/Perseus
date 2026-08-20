import { Controller, Post, UseGuards } from '@nestjs/common';
import type { RunTicket } from '@perseus/contracts';
import { AuthGuard } from '../auth.guard';
import { RateLimit } from '../rate-limit.guard';
import { RunTicketService } from './run-ticket.service';

@Controller('runs')
export class RunsController {
  constructor(private readonly tickets: RunTicketService) {}

  /**
   * Opens a run.
   *
   * Called when the first character is typed rather than when the text appears:
   * a ticket per text drawn would be a request every time somebody presses
   * Escape looking for a text they like, and the clock it starts would begin
   * before the typing did.
   */
  @Post()
  @UseGuards(AuthGuard)
  @RateLimit({ limit: 60, windowMs: 60_000 })
  open(): RunTicket {
    return this.tickets.issue();
  }
}
