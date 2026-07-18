import { Controller, Get } from "@tsuki-hono/common";
import { healthService } from "../../../../../packages/core/src/modules/health/health.service.js";

@Controller("health")
export class HealthController {
  @Get("/")
  async getHealth() {
    const data = await healthService.get();
    return { ok: true, data };
  }
}
