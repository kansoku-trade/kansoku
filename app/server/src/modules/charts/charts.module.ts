import { Module } from "@tsuki-hono/common";
import { ChartsController } from "./charts.controller.js";

@Module({
  controllers: [ChartsController],
})
export class ChartsModule {}
