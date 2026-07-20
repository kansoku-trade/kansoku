import { Controller, Get, Query } from '@tsuki-hono/common';
import { overviewService } from '@kansoku/core/overview/overview.service';

export { resetOverviewCacheForTests } from '@kansoku/core/overview/overview.service';

@Controller('overview')
export class OverviewController {
  @Get('/')
  async getBoard() {
    const data = await overviewService.board();
    return { ok: true, data };
  }

  @Get('/recap')
  async getRecap(@Query() query: { date?: string }) {
    const data = await overviewService.recap({ date: query.date });
    return { ok: true, data };
  }

  @Get('/stats')
  async getStats() {
    const data = await overviewService.stats();
    return { ok: true, data };
  }

  @Get('/usage')
  async getUsage(@Query() query: { date?: string }) {
    const data = await overviewService.usage({ date: query.date });
    return { ok: true, data };
  }

  @Get('/recap-dates')
  async getRecapDates() {
    const data = await overviewService.recapDates();
    return { ok: true, data };
  }
}
