import { Module } from "@tsuki-hono/common";
import { AnnotationsModule } from "./annotations/annotations.module.js";
import { ChartsModule } from "./charts/charts.module.js";
import { HealthModule } from "./health/health.module.js";
import { PositionsModule } from "./positions/positions.module.js";
import { SymbolsModule } from "./symbols/symbols.module.js";

@Module({
  imports: [HealthModule, ChartsModule, SymbolsModule, AnnotationsModule, PositionsModule],
})
export class AppModule {}
