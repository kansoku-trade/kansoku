import { afterEach, describe, expect, it } from 'vitest';
import { allRoutes } from '../src/contract/index.js';
import { symbolsService } from '../src/symbols/symbols.service.js';
import { freeHooks, registerProModule, unregisterProModuleForTests } from '../src/pro/registry.js';

type GatedService = Record<string, (input: { sym: string }) => Promise<unknown>>;

const serviceByGroup: Record<string, GatedService> = {
  symbols: symbolsService as unknown as GatedService,
};

interface GatedRoute {
  group: string;
  method: string;
}

const gatedRoutes: GatedRoute[] = [];
for (const [group, routeGroup] of Object.entries(allRoutes)) {
  for (const [method, meta] of Object.entries(routeGroup.routes)) {
    if (meta.feature) gatedRoutes.push({ group, method });
  }
}

afterEach(() => {
  unregisterProModuleForTests();
});

describe('feature gate parity', () => {
  it('found at least one gated route in the contract', () => {
    expect(gatedRoutes.length).toBeGreaterThan(0);
  });

  for (const { group, method } of gatedRoutes) {
    describe(`${group}.${method}`, () => {
      it('rejects with 403 LICENSE_REQUIRED when pro is present without a valid license', async () => {
        const service = serviceByGroup[group];
        if (!service) {
          expect.fail(
            `add "${group}" to serviceByGroup in featureGateParity.test.ts so this gated route is covered`,
          );
          return;
        }
        registerProModule({ hooks: freeHooks });
        const err = await service[method]({ sym: 'NVDA.US' }).catch((e: unknown) => e);
        expect(err).toMatchObject({ status: 403, code: 'LICENSE_REQUIRED' });
      });

      it('rejects with 404 when no pro module is registered', async () => {
        const service = serviceByGroup[group];
        if (!service) {
          expect.fail(
            `add "${group}" to serviceByGroup in featureGateParity.test.ts so this gated route is covered`,
          );
          return;
        }
        const err = await service[method]({ sym: 'NVDA.US' }).catch((e: unknown) => e);
        expect(err).toMatchObject({ status: 404 });
      });
    });
  }
});
