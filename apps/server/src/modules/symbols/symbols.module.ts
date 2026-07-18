import { Module } from "@tsuki-hono/common";
import { SymbolsController } from "./symbols.controller.js";

@Module({
  controllers: [SymbolsController],
})
export class SymbolsModule {}
