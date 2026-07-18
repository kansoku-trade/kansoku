import { Module } from "@tsuki-hono/common";
import { OverviewController } from "./overview.controller.js";

@Module({
  controllers: [OverviewController],
})
export class OverviewModule {}
