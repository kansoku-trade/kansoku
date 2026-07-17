import { Module, type Constructor } from "@tsuki-hono/common";
import { getPro, isProPresent } from "../../../packages/core/src/pro/registry.js";
import { registerBuiltinProServer } from "../pro/registerBuiltin.js";
import { AnnotationsModule } from "./annotations/annotations.module.js";
import { CapabilitiesModule } from "./capabilities/capabilities.module.js";
import { ChartsModule } from "./charts/charts.module.js";
import { CredentialsModule } from "./credentials/credentials.module.js";
import { HealthModule } from "./health/health.module.js";
import { LegacyModule } from "./legacy/legacy.module.js";
import { OverviewModule } from "./overview/overview.module.js";
import { PositionsModule } from "./positions/positions.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { SymbolsModule } from "./symbols/symbols.module.js";

// registerBuiltinProServer() normally runs from runtimeInit.ts early in boot,
// but this module's decorator reads the registry synchronously at import
// time — which can happen before runtimeInit.ts runs (e.g. tests that import
// this module directly). Registering here too guarantees the AI module list
// below is never built against an empty registry.
if (!isProPresent()) registerBuiltinProServer();

const aiModules = (getPro()?.tsukiModules ?? []) as Constructor[];

@Module({
  imports: [
    HealthModule,
    ChartsModule,
    SymbolsModule,
    AnnotationsModule,
    PositionsModule,
    OverviewModule,
    SettingsModule,
    LegacyModule,
    CredentialsModule,
    CapabilitiesModule,
    ...aiModules,
  ],
})
export class AppModule {}
