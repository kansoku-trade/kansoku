import { Controller, Get } from "@tsuki-hono/common";
import { createPositionsService } from "@kansoku/core/modules/positions/positions.service";

@Controller("positions")
export class PositionsController {
  private readonly service = createPositionsService();

  @Get("/")
  async getPositions() {
    const data = await this.service.list();
    return { ok: true, data };
  }
}
