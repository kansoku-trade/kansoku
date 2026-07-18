import { Module } from "@tsuki-hono/common";
import { ResearchController } from "./research.controller.js";

@Module({
  controllers: [ResearchController],
})
export class ResearchModule {}
