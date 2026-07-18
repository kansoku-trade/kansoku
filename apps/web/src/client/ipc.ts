import { createIpcProxy } from "electron-ipc-decorator/client";
import type { IpcRenderer } from "electron";
import { allRoutes, type AppApi, type TransportEnvelope } from "@kansoku/core/contract/index";
import { unwrapEnvelope } from "./envelope";

type RawIpcServices = {
  [G in keyof AppApi]: {
    [M in keyof AppApi[G]]: (input?: unknown) => Promise<TransportEnvelope<unknown>>;
  };
};

interface MinimalIpcRenderer {
  invoke(channel: string, ...args: unknown[]): Promise<unknown>;
}

function getDesktopRpc(): IpcRenderer | null {
  if (typeof window === "undefined") return null;
  const rpc = (window as unknown as { desktop?: { rpc?: MinimalIpcRenderer } }).desktop?.rpc;
  return (rpc ?? null) as unknown as IpcRenderer | null;
}

export function createIpcClient(): AppApi | null {
  const raw = createIpcProxy<RawIpcServices>(getDesktopRpc());
  if (!raw) return null;

  const client: Record<string, Record<string, (input?: unknown) => Promise<unknown>>> = {};
  for (const [groupName, group] of Object.entries(allRoutes)) {
    const methods: Record<string, (input?: unknown) => Promise<unknown>> = {};
    for (const methodName of Object.keys(group.routes)) {
      methods[methodName] = async (input?: unknown) => {
        const envelope = await (raw as Record<string, Record<string, (input?: unknown) => Promise<TransportEnvelope<unknown>>>>)[
          groupName
        ][methodName](input);
        return unwrapEnvelope(envelope, envelope.ok ? 0 : (envelope.status ?? 0)).data;
      };
    }
    client[groupName] = methods;
  }

  return client as unknown as AppApi;
}
