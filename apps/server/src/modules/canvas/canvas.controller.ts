import { Body, Controller, Get, Param, Post, Put } from '@tsuki-hono/common';
import { canvasService } from '@kansoku/core/canvas/canvas.service';
import { ClientError } from '@kansoku/core/platform/errors';

function jsonBody(body: unknown): Record<string, unknown> {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ClientError('request body must be JSON');
  }
  return body as Record<string, unknown>;
}

@Controller('canvas')
export class CanvasController {
  @Get('/')
  async list() {
    const data = await canvasService.list();
    return { ok: true, data };
  }

  @Get('/:slug')
  async getOne(@Param('slug') slug: string) {
    const data = await canvasService.get({ slug });
    return { ok: true, data };
  }

  @Put('/:slug')
  async save(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = jsonBody(body);
    const data = await canvasService.save({
      slug,
      title: String(parsed.title ?? ''),
      source: String(parsed.source ?? ''),
    });
    return { ok: true, data };
  }

  @Post('/:slug/check')
  async recordCheck(@Param('slug') slug: string, @Body() body: unknown) {
    const parsed = jsonBody(body);
    const stage = parsed.stage === 'runtime' ? 'runtime' : 'compile';
    const issues = Array.isArray(parsed.issues)
      ? parsed.issues.map((issue) => String(issue))
      : [];
    const data = await canvasService.recordCheck({ slug, issues, stage });
    return { ok: true, data };
  }
}
