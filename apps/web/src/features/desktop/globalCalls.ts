export type GlobalCallHandler = (args: unknown) => unknown | Promise<unknown>;

export interface RendererCallsBridge {
  handle(cb: (method: string, args: unknown) => Promise<unknown>): () => void;
}

interface DesktopGlobal {
  rendererCalls?: RendererCallsBridge;
}

export function getRendererCallsBridge(
  win: unknown = typeof window === 'undefined' ? undefined : window,
): RendererCallsBridge | null {
  const bridge = (win as { desktop?: DesktopGlobal } | undefined)?.desktop?.rendererCalls;
  return bridge ?? null;
}

export interface GlobalCallManager {
  register(method: string, handler: GlobalCallHandler): () => void;
}

export function createGlobalCallManager(bridge: RendererCallsBridge | null): GlobalCallManager {
  const handlers = new Map<string, GlobalCallHandler>();
  let wired = false;

  function wire(): void {
    if (wired || !bridge) return;
    wired = true;
    bridge.handle(async (method, args) => {
      const handler = handlers.get(method);
      if (!handler) throw new Error(`no handler for ${method}`);
      return handler(args);
    });
  }

  return {
    register(method, handler): () => void {
      handlers.set(method, handler);
      wire();
      return () => {
        if (handlers.get(method) === handler) handlers.delete(method);
      };
    },
  };
}

let defaultManager: GlobalCallManager | null = null;

export function registerGlobalCall(method: string, handler: GlobalCallHandler): () => void {
  defaultManager ??= createGlobalCallManager(getRendererCallsBridge());
  return defaultManager.register(method, handler);
}
