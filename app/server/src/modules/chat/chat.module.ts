import { Module } from "@tsuki-hono/common";
import { ChatController } from "./chat.controller.js";

@Module({
  controllers: [ChatController],
})
export class ChatModule {}
