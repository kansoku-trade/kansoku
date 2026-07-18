import { Controller, Get } from "@tsuki-hono/common";
import { createPositionsService } from "../../../../../packages/core/src/modules/positions/positions.service.js";

@Controller("positions")
export class PositionsController {
  private readonly service = createPositionsService();

  @Get("/")
  async getPositions() {
    const data = await this.service.list();
    return { ok: true, data };
  }
}
