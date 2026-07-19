import type { Constructor } from '@tsuki-hono/common';
import { ServerEdition } from '@kansoku/core/edition/serverEdition';
import type { ServerBuilder } from '@kansoku/core/edition/serverBuilder';
import { getPro } from '@kansoku/core/pro/registry';
import { createDefaultServerEditionHost } from '@kansoku/core/edition/host';

class LegacyCompatServerEdition extends ServerEdition {
  override configureServer(builder: ServerBuilder): void {
    super.configureServer(builder);
    const legacyModules = (getPro()?.tsukiModules ?? []) as Constructor[];
    for (const mod of legacyModules) builder.addModule(mod);
  }
}

export function defaultServerEdition(): LegacyCompatServerEdition {
  return new LegacyCompatServerEdition(createDefaultServerEditionHost());
}
