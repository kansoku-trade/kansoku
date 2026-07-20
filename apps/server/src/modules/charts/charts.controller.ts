import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@tsuki-hono/common';
import { chartsService } from '@kansoku/core/charts/charts.service';
import { ClientError } from '@kansoku/core/platform/errors';

type QueryParams = Record<string, string | undefined>;

function jsonBody(body: unknown, hint?: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ClientError('request body must be JSON', hint);
  }
  return body as Record<string, unknown>;
}

@Controller('charts')
export class ChartsController {
  @Get('/')
  async list(@Query() query: QueryParams) {
    const data = await chartsService.list({
      type: query.type,
      symbol: query.symbol,
      limit: query.limit ? Number(query.limit) : undefined,
      stale: query.stale === 'true',
    });
    return { ok: true, data };
  }

  @Post('/')
  async create(@Body() body: unknown) {
    const parsed = jsonBody(body, 'e.g. {"type": "sepa", "symbol": "MRVL.US"}');
    const result = await chartsService.create(parsed);
    return { ok: true, data: result.data, meta: result.meta };
  }

  @Get('/:id/built')
  async built(@Param('id') id: string, @Query() query: QueryParams) {
    const data = await chartsService.built({
      id,
      count: query.count,
      mode: query.mode === 'forward' ? 'forward' : undefined,
    });
    return { ok: true, data };
  }

  @Get('/:id')
  async getOne(@Param('id') id: string) {
    const data = await chartsService.get({ id });
    return { ok: true, data };
  }

  @Patch('/:id')
  async patch(@Param('id') id: string, @Body() body: unknown) {
    const parsed = jsonBody(body);
    const result = await chartsService.update({ id, ...parsed });
    return { ok: true, data: result.data, meta: result.meta };
  }

  @Delete('/:id')
  async remove(@Param('id') id: string) {
    const data = await chartsService.remove({ id });
    return { ok: true, data };
  }
}
