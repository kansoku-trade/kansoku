import 'reflect-metadata';
import { createApplication, type HonoHttpApplication } from '@tsuki-hono/core';
import { BaseServerEdition } from '@kansoku/core/edition/base';
import { ServerBuilder } from '@kansoku/core/edition/serverBuilder';
import { AppExceptionFilter } from './filters/app-exception.filter.js';
import { buildAppModule, SERVER_PUBLIC_MODULES } from './modules/app.module.js';
import { defaultServerEdition } from './modules/legacyServerEdition.js';

export interface Kernel {
  app: HonoHttpApplication;
}

// globalPrefix "/api" lets controllers use bare paths (e.g. @Controller("health"))
// for "/api/health".
export async function createKernel(
  edition: BaseServerEdition = defaultServerEdition(),
): Promise<Kernel> {
  const builder = new ServerBuilder(SERVER_PUBLIC_MODULES);
  edition.configureServer(builder);
  const RootModule = buildAppModule(builder.build());
  const app = await createApplication(RootModule, { globalPrefix: '/api' });
  app.useGlobalFilters(new AppExceptionFilter());
  return { app };
}
