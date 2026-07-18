import { describe, expect, it, vi } from "vitest";

const status = vi.fn().mockResolvedValue({ configured: true, method: "cli", state: "ready", cliPath: "/bin/longbridge", lastError: null });

vi.mock("../../../../packages/core/src/modules/credentials/credentials.service.js", () => ({
  credentialsService: { status },
}));

const { createCredentialsBridgeHandlers, registerCredentialsIpc } = await import("../../src/credentials/bridge.js");
const { CREDENTIALS_CHANNELS } = await import("../../src/credentials/channels.js");

describe("credentials CLI bridge", () => {
  it("exposes only the read-only CLI status channel", async () => {
    const handlers = createCredentialsBridgeHandlers();
    await expect(handlers.get()).resolves.toMatchObject({ state: "ready" });

    const registered = new Map<string, (...args: unknown[]) => unknown>();
    registerCredentialsIpc({ handle: (channel, listener) => registered.set(channel, listener) }, handlers);
    expect([...registered.keys()]).toEqual([CREDENTIALS_CHANNELS.get]);
  });
});
