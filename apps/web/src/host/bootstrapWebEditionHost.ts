import * as React from 'react';
import * as ReactJsxRuntime from 'react/jsx-runtime';
import { isValidWebEditionEntry, WEB_EDITION_ABI_VERSION } from '@kansoku/core/pro/webEditionHost';
import type { WebEditionHost } from '@kansoku/core/pro/webEditionHost';

export const PRO_ENTRY_SPECIFIER = 'pro-asset://web/index.mjs';

// Bare specifiers a pro edition chunk is built with `external` (see
// apps/pro/vite.config.web.ts): react / react/jsx-runtime / react-dom/client.
// Import maps can only be added to a document before the FIRST module
// script resolves a bare specifier — apps/web's own module graph never uses
// these as bare specifiers (its own build inlines React), so this stays
// spec-legal even though it's injected lazily, right before the first
// dynamic import() of a pro chunk, instead of up front in index.html.
const SHARED_REACT_SPECIFIERS = ['react', 'react/jsx-runtime', 'react-dom/client'] as const;
type SharedReactSpecifier = (typeof SHARED_REACT_SPECIFIERS)[number];

export interface ReactSingletonModules {
  react: unknown;
  reactJsxRuntime: unknown;
  reactDomClient: unknown;
}

const HOST_MODULE_STASH_GLOBAL = '__kansokuWebEditionHostModules__';

// A Module Namespace Object's own enumerable keys are exactly its bound
// export names (including "default" when present) — this lets the shim
// re-export a real, already-loaded module without knowing its export list
// ahead of time.
export function buildReexportShimSource(stashKey: string, propertyKey: string, namespace: object): string {
  const exportNames = Object.keys(namespace);
  const lines = exportNames
    .filter((name) => name !== 'default')
    .map((name) => `export const ${JSON.stringify(name).slice(1, -1)} = globalThis[${JSON.stringify(
      stashKey,
    )}][${JSON.stringify(propertyKey)}][${JSON.stringify(name)}];`);
  if (exportNames.includes('default')) {
    lines.push(
      `export default globalThis[${JSON.stringify(stashKey)}][${JSON.stringify(propertyKey)}].default;`,
    );
  }
  return lines.join('\n');
}

export function buildSharedReactImportMap(
  modules: ReactSingletonModules,
  createBlobUrl: (source: string) => string,
): { imports: Record<SharedReactSpecifier, string> } {
  const byId: Record<SharedReactSpecifier, unknown> = {
    react: modules.react,
    'react/jsx-runtime': modules.reactJsxRuntime,
    'react-dom/client': modules.reactDomClient,
  };

  const imports = {} as Record<SharedReactSpecifier, string>;
  for (const specifier of SHARED_REACT_SPECIFIERS) {
    const namespace = byId[specifier] as object;
    const source = buildReexportShimSource(HOST_MODULE_STASH_GLOBAL, specifier, namespace);
    imports[specifier] = createBlobUrl(source);
  }
  return { imports };
}

let importMapInjected = false;

export function injectSharedReactImportMapOnce(
  modules: ReactSingletonModules,
  doc: Document = document,
): void {
  if (importMapInjected) return;
  importMapInjected = true;

  const stash = (window as unknown as Record<string, unknown>)[HOST_MODULE_STASH_GLOBAL] as
    | Record<string, unknown>
    | undefined;
  const target = stash ?? {};
  target.react = modules.react;
  target['react/jsx-runtime'] = modules.reactJsxRuntime;
  target['react-dom/client'] = modules.reactDomClient;
  (window as unknown as Record<string, unknown>)[HOST_MODULE_STASH_GLOBAL] = target;

  const importMap = buildSharedReactImportMap(modules, (source) =>
    URL.createObjectURL(new Blob([source], { type: 'text/javascript' })),
  );

  const script = doc.createElement('script');
  script.type = 'importmap';
  script.textContent = JSON.stringify(importMap);
  // Electron's desktop CSP only allows script-src via 'self' | pro-asset: |
  // blob: | 'nonce-<value>' — no 'unsafe-inline'. The nonce IDL property must
  // be set (not the "nonce" attribute — browsers hide that attribute's value
  // from a dynamically created element's own getAttribute/setAttribute) for
  // CSP to accept this inline script. desktop.cspNonce is exposed by the
  // Electron preload only on privileged origins; plain browser/community
  // builds have no such CSP restriction and get undefined here, which is a
  // no-op.
  const cspNonce = (window as unknown as { desktop?: { cspNonce?: string } }).desktop?.cspNonce;
  if (cspNonce) script.nonce = cspNonce;
  doc.head.appendChild(script);
}

export function resetImportMapInjectionForTests(): void {
  importMapInjected = false;
}

export interface BootstrapDeps {
  loadEntry?: (specifier: string) => Promise<unknown>;
  createHost?: () => WebEditionHost;
  reactSingleton?: ReactSingletonModules;
  registerRoute?: WebEditionHost['registerRoute'];
}

export async function bootstrapWebEditionHost(
  container: Element,
  deps: BootstrapDeps = {},
): Promise<(() => void) | null> {
  const reactSingleton: ReactSingletonModules = deps.reactSingleton ?? {
    react: React,
    reactJsxRuntime: ReactJsxRuntime,
    reactDomClient: await import('react-dom/client'),
  };

  injectSharedReactImportMapOnce(reactSingleton);

  const load = deps.loadEntry ?? ((specifier: string) => import(/* @vite-ignore */ specifier));
  let mod: unknown;
  try {
    mod = await load(PRO_ENTRY_SPECIFIER);
  } catch (error) {
    // Expected in the community build / when the pro-asset manifest is
    // absent or locked — the protocol handler 404s and the dynamic import
    // rejects. Not an error worth surfacing to the user.
    console.info('[web-edition] pro-asset entry unavailable, not mounting', error);
    return null;
  }

  if (!isValidWebEditionEntry(mod)) {
    console.error('[web-edition] pro-asset entry failed ABI validation, refusing to mount');
    return null;
  }

  const host: WebEditionHost = deps.createHost?.() ?? {
    abiVersion: WEB_EDITION_ABI_VERSION,
    react: reactSingleton.react,
    reactJsxRuntime: reactSingleton.reactJsxRuntime,
    registerRoute: deps.registerRoute ?? (() => {}),
  };

  const edition = mod.createEdition(host);
  return edition.mount(container);
}
