import { Controller, Get } from "@tsuki-hono/common";
import { CHART_DATA_DIR, PORT } from "../../env.js";

@Controller("health")
export class HealthController {
  @Get("/")
  getHealth() {
    return { ok: true, data: { status: "up", port: PORT, dataDir: CHART_DATA_DIR } };
  }
}
