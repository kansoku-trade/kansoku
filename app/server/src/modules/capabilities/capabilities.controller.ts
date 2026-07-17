import { Controller, Get } from "@tsuki-hono/common";
import { capabilitiesService } from "../../../../packages/core/src/modules/capabilities/capabilities.service.js";

@Controller("capabilities")
export class CapabilitiesController {
  @Get("/")
  async get() {
    const data = await capabilitiesService.get();
    return { ok: true, data };
  }
}
