import { Module } from "@tsuki-hono/common";
import { LobeHubController } from "./lobehub.controller.js";

@Module({
  controllers: [LobeHubController],
})
export class LobeHubModule {}
