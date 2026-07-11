import { Controller, Get } from "@tsuki-hono/common";
import { credentialsService } from "../../../../packages/core/src/modules/credentials/credentials.service.js";

@Controller("credentials")
export class CredentialsController {
  @Get("/status")
  async getStatus() {
    const data = await credentialsService.status();
    return { ok: true, data };
  }
}
