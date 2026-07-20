import { Controller, Get } from '@tsuki-hono/common';
import { healthService } from '@kansoku/core/health/health.service';

@Controller('health')
export class HealthController {
  @Get('/')
  async getHealth() {
    const data = await healthService.get();
    return { ok: true, data };
  }
}
