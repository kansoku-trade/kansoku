import { Module } from "@tsuki-hono/common";
import { AssistantController } from "./assistant.controller.js";

@Module({
  controllers: [AssistantController],
})
export class AssistantModule {}
