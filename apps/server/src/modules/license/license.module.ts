import { Module } from "@tsuki-hono/common";
import { LicenseController } from "./license.controller.js";

@Module({
  controllers: [LicenseController],
})
export class LicenseModule {}
