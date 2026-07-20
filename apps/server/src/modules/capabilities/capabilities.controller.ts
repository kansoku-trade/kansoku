import { Controller, Get } from '@tsuki-hono/common';
import { capabilitiesService } from '@kansoku/core/capabilities/capabilities.service';

@Controller('capabilities')
export class CapabilitiesController {
  @Get('/')
  async get() {
    const data = await capabilitiesService.get();
    return { ok: true, data };
  }
}
