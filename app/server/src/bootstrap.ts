import "reflect-metadata";
import { createApplication, type HonoHttpApplication } from "@tsuki-hono/core";
import { AppExceptionFilter } from "./filters/app-exception.filter.js";
import { AppModule } from "./modules/app.module.js";

export interface Kernel {
  app: HonoHttpApplication;
}

// globalPrefix "/api" lets controllers use bare paths (e.g. @Controller("health"))
// for "/api/health".
export async function createKernel(): Promise<Kernel> {
  const app = await createApplication(AppModule, { globalPrefix: "/api" });
  app.useGlobalFilters(new AppExceptionFilter());
  return { app };
}
