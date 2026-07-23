import { Body, Controller, Get, Post, Query } from '@tsuki-hono/common';
import type { ResearchCreateInput, ResearchKind } from '@kansoku/core/contract/research';
import { ClientError } from '@kansoku/core/platform/errors';
import { researchCreate } from '@kansoku/core/research/createResearch';
import { researchService } from '@kansoku/core/research/research.service';

function jsonBody(body: unknown, hint?: string): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ClientError('request body must be JSON', hint);
  }
  return body as Record<string, unknown>;
}

function parseKind(value: string | undefined): ResearchKind | undefined {
  if (value === undefined || value === '') return undefined;
  if (value === 'stock' || value === 'journal') return value;
  throw new ClientError('invalid research kind', 'expected stock or journal');
}

function requirePath(path: unknown): string {
  if (typeof path !== 'string' || !path)
    throw new ClientError('research document path is required');
  return path;
}

@Controller('research')
export class ResearchController {
  @Get('/')
  async list(@Query() query: { kind?: string; query?: string }) {
    const data = await researchService.list({ kind: parseKind(query.kind), query: query.query });
    return { ok: true, data };
  }

  @Get('/document')
  async get(@Query('path') path: string | undefined) {
    const data = await researchService.get({ path: requirePath(path) });
    return { ok: true, data };
  }

  @Post('/documents')
  async create(@Body() body: unknown) {
    const parsed = jsonBody(body, 'e.g. {"kind": "stock", "symbol": "MRVL"}');
    const data = await researchCreate(parsed as ResearchCreateInput);
    return { ok: true, data };
  }
}
