import { Controller, Get, Param, Post, Query } from '@tsuki-hono/common';
import type { EventListInput } from '@kansoku/core/contract/index';
import { eventsService } from '@kansoku/core/events/events.service';

@Controller('events')
export class EventsController {
  // Declared before `/:id` on purpose: the router matches in declaration order, and
  // a leading `:id` route would swallow this path.
  @Get('/sources/health')
  async sourceHealth() {
    const data = await eventsService.sourceHealth();
    return { ok: true, data };
  }

  @Post('/:id/canvas')
  async generateCanvas(@Param('id') id: string) {
    const data = await eventsService.generateCanvas({ id });
    return { ok: true, data };
  }

  @Get('/')
  async list(
    @Query()
    query: {
      symbol?: string;
      source?: string;
      class?: string;
      since?: string;
      before?: string;
      beforeId?: string;
      limit?: string;
    },
  ) {
    // Handed over verbatim: core owns the validation so this route and the desktop
    // IPC service cannot drift apart on what they accept.
    const data = await eventsService.list(query as EventListInput);
    return { ok: true, data };
  }

  @Get('/:id')
  async getOne(@Param('id') id: string) {
    const data = await eventsService.get({ id });
    return { ok: true, data };
  }
}
