import { Module } from "@tsuki-hono/common";
import { LegacyController } from "./legacy.controller.js";

@Module({
  controllers: [LegacyController],
})
export class LegacyModule {}
