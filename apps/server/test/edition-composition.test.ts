import { Controller, Get, Module } from '@tsuki-hono/common';
import { describe, expect, it } from 'vitest';
import { BaseServerEdition } from '@kansoku/core/edition/base';
import type { ServerBuilder } from '@kansoku/core/edition/serverBuilder';
import { createDefaultServerEditionHost } from '@kansoku/core/edition/host';
import { createKernel } from '../src/bootstrap.js';

@Controller('test-only')
class TestOnlyController {
  @Get('/ping')
  ping() {
    return { pong: true };
  }
}

@Module({ controllers: [TestOnlyController] })
class TestOnlyModule {}

class TestEdition extends BaseServerEdition {
  override configureServer(builder: ServerBuilder): void {
    super.configureServer(builder);
    builder.addModule(TestOnlyModule);
  }
}

describe('edition composition', () => {
  it('exposes an edition-only route through the kernel that installed it', async () => {
    const { app } = await createKernel(new TestEdition(createDefaultServerEditionHost()));
    const res = await app.getInstance().request('/api/test-only/ping');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ pong: true });
  });

  it('does not expose that route through the default legacy-compat kernel', async () => {
    const { app } = await createKernel();
    const res = await app.getInstance().request('/api/test-only/ping');
    expect(res.status).toBe(404);
  });
});
