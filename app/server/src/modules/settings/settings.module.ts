import { Module } from "@tsuki-hono/common";
import { SettingsController } from "./settings.controller.js";

@Module({
  controllers: [SettingsController],
})
export class SettingsModule {}
