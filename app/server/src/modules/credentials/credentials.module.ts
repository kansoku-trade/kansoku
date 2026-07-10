import { Module } from "@tsuki-hono/common";
import { CredentialsController } from "./credentials.controller.js";

@Module({
  controllers: [CredentialsController],
})
export class CredentialsModule {}
