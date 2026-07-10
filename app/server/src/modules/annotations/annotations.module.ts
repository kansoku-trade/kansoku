import { Module } from "@tsuki-hono/common";
import { AnnotationsController } from "./annotations.controller.js";

@Module({
  controllers: [AnnotationsController],
})
export class AnnotationsModule {}
