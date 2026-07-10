import { Module } from "@tsuki-hono/common";
import { ChartsModule } from "./charts/charts.module.js";
import { HealthModule } from "./health/health.module.js";

@Module({
  imports: [HealthModule, ChartsModule],
})
export class AppModule {}
