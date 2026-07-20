import { promises as fs } from 'node:fs';
import { Controller, Get } from '@tsuki-hono/common';
import { LEGACY_CHARTS_DIR } from '@kansoku/core/platform/env';

@Controller('legacy')
export class LegacyController {
  @Get('/')
  async list() {
    let files: string[] = [];
    try {
      files = (await fs.readdir(LEGACY_CHARTS_DIR)).filter((f) => f.endsWith('.html'));
    } catch {
      files = [];
    }
    files.sort((a, b) => (a < b ? 1 : -1));
    return {
      ok: true,
      data: files.map((f) => ({
        file: f,
        url: `/legacy/${encodeURIComponent(f)}`,
        date: f.slice(0, 10),
      })),
    };
  }
}
