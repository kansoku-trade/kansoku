import { Module } from "@tsuki-hono/common";
import { PositionsController } from "./positions.controller.js";

@Module({
  controllers: [PositionsController],
})
export class PositionsModule {}
