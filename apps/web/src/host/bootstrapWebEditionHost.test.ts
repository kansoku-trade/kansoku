// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { WEB_EDITION_ABI_VERSION } from '@kansoku/core/pro/webEditionHost';
import {
  bootstrapWebEditionHost,
  buildReexportShimSource,
  buildSharedReactImportMap,
  injectSharedReactImportMapOnce,
  resetImportMapInjectionForTests,
} from './bootstrapWebEditionHost';

afterEach(() => {
  resetImportMapInjectionForTests();
  document.head.querySelectorAll('script[type="importmap"]').forEach((el) => el.remove());
});

describe('buildReexportShimSource', () => {
  it('re-exports every named export plus default via the global stash', () => {
    const source = buildReexportShimSource('__stash__', 'react', { useState: () => {}, default: {} });

    expect(source).toContain(
      'export const useState = globalThis["__stash__"]["react"]["useState"];',
    );
    expect(source).toContain('export default globalThis["__stash__"]["react"].default;');
  });

  it('handles a namespace with no default export', () => {
    const source = buildReexportShimSource('__stash__', 'react/jsx-runtime', { jsx: () => {} });
    expect(source).not.toContain('export default');
    expect(source).toContain('export const jsx =');
  });
});

describe('buildSharedReactImportMap', () => {
  it('maps all three shared bare specifiers to distinct blob urls', () => {
    let counter = 0;
    const createBlobUrl = () => `blob:fake-${counter++}`;
    const map = buildSharedReactImportMap(
      { react: { default: {} }, reactJsxRuntime: { jsx: () => {} }, reactDomClient: { createRoot: () => {} } },
      createBlobUrl,
    );

    expect(Object.keys(map.imports)).toEqual(['react', 'react/jsx-runtime', 'react-dom/client']);
    expect(new Set(Object.values(map.imports)).size).toBe(3);
  });
});

describe('injectSharedReactImportMapOnce', () => {
  afterEach(() => {
    delete (window as unknown as Record<string, unknown>).desktop;
  });

  it('appends exactly one <script type="importmap"> even when called repeatedly', () => {
    const modules = { react: { default: {} }, reactJsxRuntime: {}, reactDomClient: {} };

    injectSharedReactImportMapOnce(modules);
    injectSharedReactImportMapOnce(modules);
    injectSharedReactImportMapOnce(modules);

    expect(document.head.querySelectorAll('script[type="importmap"]').length).toBe(1);
  });

  it('sets the script.nonce IDL property from window.desktop.cspNonce when the Electron preload exposes one', () => {
    (window as unknown as { desktop: { cspNonce: string } }).desktop = { cspNonce: 'test-nonce-value' };
    const modules = { react: { default: {} }, reactJsxRuntime: {}, reactDomClient: {} };

    injectSharedReactImportMapOnce(modules);

    const script = document.head.querySelector('script[type="importmap"]') as HTMLScriptElement;
    expect(script.nonce).toBe('test-nonce-value');
  });

  it('leaves script.nonce empty when no desktop.cspNonce is present (plain browser/community build)', () => {
    const modules = { react: { default: {} }, reactJsxRuntime: {}, reactDomClient: {} };

    injectSharedReactImportMapOnce(modules);

    const script = document.head.querySelector('script[type="importmap"]') as HTMLScriptElement;
    expect(script.nonce).toBe('');
  });

  it('stashes the real module references on window so the blob shim can re-export them', () => {
    const reactNamespace = { default: {}, useState: () => {} };
    injectSharedReactImportMapOnce({
      react: reactNamespace,
      reactJsxRuntime: {},
      reactDomClient: {},
    });

    const stash = (window as unknown as Record<string, unknown>).__kansokuWebEditionHostModules__ as
      | Record<string, unknown>
      | undefined;
    expect(stash?.react).toBe(reactNamespace);
  });
});

function fakeValidEntryModule(mountSpy: (host: unknown, container: Element) => () => void) {
  return {
    abiVersion: WEB_EDITION_ABI_VERSION,
    runtime: 'web',
    createEdition(host: unknown) {
      return { mount: (container: Element) => mountSpy(host, container) };
    },
  };
}

describe('bootstrapWebEditionHost', () => {
  it('mounts a valid entry and returns its cleanup function, passing through the exact host.react reference', async () => {
    const container = document.createElement('div');
    const reactSingleton = { react: { marker: 'the-one-react' }, reactJsxRuntime: {}, reactDomClient: {} };
    let seenHost: unknown;
    let cleanupCalled = false;
    const mountSpy = (host: unknown, mountedContainer: Element) => {
      seenHost = host;
      expect(mountedContainer).toBe(container);
      return () => {
        cleanupCalled = true;
      };
    };

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    const cleanup = await bootstrapWebEditionHost(container, {
      reactSingleton,
      loadEntry: async () => fakeValidEntryModule(mountSpy),
    });

    expect(cleanup).toBeTypeOf('function');
    expect((seenHost as { react: unknown }).react).toBe(reactSingleton.react);
    expect(consoleError).not.toHaveBeenCalled();

    cleanup!();
    expect(cleanupCalled).toBe(true);
    expect(consoleError).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('refuses to mount an ABI-invalid entry (no partial execution)', async () => {
    const container = document.createElement('div');
    let mountAttempted = false;

    const result = await bootstrapWebEditionHost(container, {
      reactSingleton: { react: {}, reactJsxRuntime: {}, reactDomClient: {} },
      loadEntry: async () => ({
        abiVersion: 999,
        runtime: 'web',
        createEdition: () => {
          mountAttempted = true;
          return { mount: () => () => {} };
        },
      }),
    });

    expect(result).toBeNull();
    expect(mountAttempted).toBe(false);
  });

  it('resolves to null instead of throwing when the entry fails to load (locked/absent manifest)', async () => {
    const container = document.createElement('div');

    const result = await bootstrapWebEditionHost(container, {
      reactSingleton: { react: {}, reactJsxRuntime: {}, reactDomClient: {} },
      loadEntry: async () => {
        throw new Error('404 not found');
      },
    });

    expect(result).toBeNull();
  });

  it('two independent mounts get independent cleanup closures with no shared state', async () => {
    const containerA = document.createElement('div');
    const containerB = document.createElement('div');
    const reactSingleton = { react: { marker: 'shared' }, reactJsxRuntime: {}, reactDomClient: {} };

    let cleanupACalls = 0;
    let cleanupBCalls = 0;

    const cleanupA = await bootstrapWebEditionHost(containerA, {
      reactSingleton,
      loadEntry: async () => fakeValidEntryModule(() => () => void cleanupACalls++),
    });
    const cleanupB = await bootstrapWebEditionHost(containerB, {
      reactSingleton,
      loadEntry: async () => fakeValidEntryModule(() => () => void cleanupBCalls++),
    });

    cleanupA!();
    expect(cleanupACalls).toBe(1);
    expect(cleanupBCalls).toBe(0);

    cleanupB!();
    expect(cleanupACalls).toBe(1);
    expect(cleanupBCalls).toBe(1);
  });
});
