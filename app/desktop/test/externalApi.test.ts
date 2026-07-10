import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BASE_PORT,
  createExternalApiFileStore,
  createGatedFetch,
  ExternalApiController,
  findAvailablePort,
  generateToken,
  isAuthorizedWsRequest,
  MAX_PORT_ATTEMPTS,
  type ExternalApiControllerDeps,
  type ServerLike,
} from "../src/externalApi.js";

describe("generateToken", () => {
  it("produces distinct base64url tokens", () => {
    const a = generateToken();
    const b = generateToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe("createGatedFetch", () => {
  const kernelFetch = vi.fn(async () => new Response("ok"));

  beforeEach(() => kernelFetch.mockClear());

  it("401s when no token is set", async () => {
    const fetch = createGatedFetch(kernelFetch, () => null);
    const res = await fetch(new Request("http://localhost/api/charts"));
    expect(res.status).toBe(401);
    expect(kernelFetch).not.toHaveBeenCalled();
  });

  it("401s on missing Authorization header", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret");
    const res = await fetch(new Request("http://localhost/api/charts"));
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: "unauthorized" });
  });

  it("401s on wrong token", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret");
    const res = await fetch(
      new Request("http://localhost/api/charts", { headers: { authorization: "Bearer wrong" } }),
    );
    expect(res.status).toBe(401);
    expect(kernelFetch).not.toHaveBeenCalled();
  });

  it("401s on a wrong token of the same length as the real one", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "abcdefgh");
    const res = await fetch(
      new Request("http://localhost/api/charts", { headers: { authorization: "Bearer 00000000" } }),
    );
    expect(res.status).toBe(401);
    expect(kernelFetch).not.toHaveBeenCalled();
  });

  it("401s on a wrong-length token", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "abcdefgh");
    const res = await fetch(
      new Request("http://localhost/api/charts", { headers: { authorization: "Bearer short" } }),
    );
    expect(res.status).toBe(401);
    expect(kernelFetch).not.toHaveBeenCalled();
  });

  it("401s on an empty Authorization header", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret");
    const res = await fetch(new Request("http://localhost/api/charts", { headers: { authorization: "" } }));
    expect(res.status).toBe(401);
    expect(kernelFetch).not.toHaveBeenCalled();
  });

  it("passes through to the kernel on the right token", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret");
    const req = new Request("http://localhost/api/charts", { headers: { authorization: "Bearer secret" } });
    const res = await fetch(req);
    expect(res.status).toBe(200);
    expect(kernelFetch).toHaveBeenCalledWith(req);
  });

  it("exempts /api/health from the token check by default", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret");
    const res = await fetch(new Request("http://localhost/api/health"));
    expect(res.status).toBe(200);
    expect(kernelFetch).toHaveBeenCalled();
  });

  it("still requires a token for non-exempt paths even with a custom exempt set", async () => {
    const fetch = createGatedFetch(kernelFetch, () => "secret", new Set(["/api/health"]));
    const res = await fetch(new Request("http://localhost/api/other"));
    expect(res.status).toBe(401);
  });
});

describe("isAuthorizedWsRequest", () => {
  it("rejects when no token is configured", () => {
    expect(isAuthorizedWsRequest({ headers: {} }, null)).toBe(false);
  });

  it("rejects a missing header", () => {
    expect(isAuthorizedWsRequest({ headers: {} }, "secret")).toBe(false);
  });

  it("rejects a wrong header", () => {
    expect(isAuthorizedWsRequest({ headers: { authorization: "Bearer wrong" } }, "secret")).toBe(false);
  });

  it("rejects a wrong header of the same length as the real token", () => {
    expect(isAuthorizedWsRequest({ headers: { authorization: "Bearer 00000000" } }, "abcdefgh")).toBe(false);
  });

  it("rejects a wrong-length header", () => {
    expect(isAuthorizedWsRequest({ headers: { authorization: "Bearer short" } }, "abcdefgh")).toBe(false);
  });

  it("rejects an empty header", () => {
    expect(isAuthorizedWsRequest({ headers: { authorization: "" } }, "secret")).toBe(false);
  });

  it("accepts the right bearer header", () => {
    expect(isAuthorizedWsRequest({ headers: { authorization: "Bearer secret" } }, "secret")).toBe(true);
  });
});

describe("findAvailablePort", () => {
  it("returns the base port when free", async () => {
    const port = await findAvailablePort(BASE_PORT, MAX_PORT_ATTEMPTS, async () => false);
    expect(port).toBe(BASE_PORT);
  });

  it("increments past taken ports", async () => {
    const taken = new Set([BASE_PORT, BASE_PORT + 1, BASE_PORT + 2]);
    const port = await findAvailablePort(BASE_PORT, MAX_PORT_ATTEMPTS, async (p) => taken.has(p));
    expect(port).toBe(BASE_PORT + 3);
  });

  it("gives up after maxAttempts and returns null", async () => {
    const port = await findAvailablePort(BASE_PORT, MAX_PORT_ATTEMPTS, async () => true);
    expect(port).toBeNull();
  });

  it("never probes beyond maxAttempts", async () => {
    const probed: number[] = [];
    await findAvailablePort(BASE_PORT, 3, async (p) => {
      probed.push(p);
      return true;
    });
    expect(probed).toEqual([BASE_PORT, BASE_PORT + 1, BASE_PORT + 2]);
  });
});

describe("createExternalApiFileStore", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "external-api-test-"));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns the empty state when no file exists", async () => {
    const store = createExternalApiFileStore(join(dir, "external-api.json"));
    expect(await store.readState()).toEqual({ enabled: false, token: null });
  });

  it("round-trips a written state", async () => {
    const filePath = join(dir, "external-api.json");
    const store = createExternalApiFileStore(filePath);
    await store.writeState({ enabled: true, token: "abc123" });
    expect(await store.readState()).toEqual({ enabled: true, token: "abc123" });
  });

  it("persists the file with owner-only permissions", async () => {
    const filePath = join(dir, "external-api.json");
    const store = createExternalApiFileStore(filePath);
    await store.writeState({ enabled: true, token: "abc123" });
    const stat = await import("node:fs/promises").then((m) => m.stat(filePath));
    expect(stat.mode & 0o777).toBe(0o600);
  });

  it("tolerates a corrupt file by returning the empty state", async () => {
    const filePath = join(dir, "external-api.json");
    await import("node:fs/promises").then((m) => m.writeFile(filePath, "{not json"));
    const store = createExternalApiFileStore(filePath);
    expect(await store.readState()).toEqual({ enabled: false, token: null });
  });
});

function makeServerStub(): ServerLike & { upgradeListeners: Array<(req: unknown, socket: { destroy(): void }) => void> } {
  const upgradeListeners: Array<(req: unknown, socket: { destroy(): void }) => void> = [];
  return {
    upgradeListeners,
    on(event, listener) {
      if (event === "upgrade") upgradeListeners.push(listener as never);
      return this;
    },
  };
}

function makeDeps(overrides: Partial<ExternalApiControllerDeps> = {}): {
  deps: ExternalApiControllerDeps;
  written: Array<{ enabled: boolean; token: string | null }>;
  closed: ServerLike[];
} {
  const written: Array<{ enabled: boolean; token: string | null }> = [];
  const closed: ServerLike[] = [];
  let persisted: { enabled: boolean; token: string | null } = { enabled: false, token: null };
  let tokenSeq = 0;

  const deps: ExternalApiControllerDeps = {
    kernelFetch: vi.fn(async () => new Response("ok")),
    serve: vi.fn((_options, callback) => {
      callback?.();
      return makeServerStub();
    }),
    attachWs: vi.fn(),
    closeServer: vi.fn(async (server) => {
      closed.push(server);
    }),
    isPortTaken: vi.fn(async () => false),
    store: {
      readState: vi.fn(async () => persisted),
      writeState: vi.fn(async (state) => {
        persisted = state;
        written.push(state);
      }),
    },
    generateToken: vi.fn(() => `token-${++tokenSeq}`),
    ...overrides,
  };
  return { deps, written, closed };
}

describe("ExternalApiController", () => {
  it("starts disabled with no persisted state", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    const state = await controller.boot();
    expect(state).toEqual({ enabled: false, port: null, token: null });
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("re-enables on boot when persisted as enabled", async () => {
    const { deps } = makeDeps({
      store: {
        readState: vi.fn(async () => ({ enabled: true, token: "saved-token" })),
        writeState: vi.fn(async () => {}),
      },
    });
    const controller = new ExternalApiController(deps);
    const state = await controller.boot();
    expect(state.enabled).toBe(true);
    expect(state.token).toBe("saved-token");
    expect(state.port).toBe(BASE_PORT);
    expect(deps.serve).toHaveBeenCalled();
  });

  it("enable() generates a token, starts the server, and persists", async () => {
    const { deps, written } = makeDeps();
    const controller = new ExternalApiController(deps);
    const state = await controller.enable();
    expect(state.enabled).toBe(true);
    expect(state.token).toBe("token-1");
    expect(state.port).toBe(BASE_PORT);
    expect(written).toEqual([{ enabled: true, token: "token-1" }]);
  });

  it("enable() is a no-op when already enabled", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    await controller.enable();
    await controller.enable();
    expect(deps.serve).toHaveBeenCalledTimes(1);
  });

  it("disable() closes the server and clears port/enabled but keeps the token on record", async () => {
    const { deps, closed } = makeDeps();
    const controller = new ExternalApiController(deps);
    await controller.enable();
    const state = await controller.disable();
    expect(state).toEqual({ enabled: false, port: null, token: "token-1" });
    expect(closed).toHaveLength(1);
  });

  it("re-enabling after disable() reuses the same token instead of minting a new one", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    await controller.enable();
    await controller.disable();
    const state = await controller.enable();
    expect(state.token).toBe("token-1");
    expect(deps.generateToken).toHaveBeenCalledTimes(1);
  });

  it("resetToken() issues a new token and keeps the server running when it was enabled", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    await controller.enable();
    const state = await controller.resetToken();
    expect(state.enabled).toBe(true);
    expect(state.token).toBe("token-2");
    expect(deps.serve).toHaveBeenCalledTimes(2);
  });

  it("resetToken() when disabled stores a fresh token without starting a server", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    const state = await controller.resetToken();
    expect(state).toEqual({ enabled: false, port: null, token: "token-1" });
    expect(deps.serve).not.toHaveBeenCalled();
  });

  it("increments the port when the base port is taken", async () => {
    const { deps } = makeDeps({ isPortTaken: vi.fn(async (port: number) => port === BASE_PORT) });
    const controller = new ExternalApiController(deps);
    const state = await controller.enable();
    expect(state.port).toBe(BASE_PORT + 1);
  });

  it("destroys unauthorized WS upgrades and lets authorized ones through", async () => {
    const { deps } = makeDeps();
    const controller = new ExternalApiController(deps);
    const state = await controller.enable();
    const server = (deps.serve as ReturnType<typeof vi.fn>).mock.results[0]!.value as ReturnType<
      typeof makeServerStub
    >;

    const destroyBad = vi.fn();
    server.upgradeListeners[0]!({ headers: {} }, { destroy: destroyBad });
    expect(destroyBad).toHaveBeenCalled();

    const destroyGood = vi.fn();
    server.upgradeListeners[0]!({ headers: { authorization: `Bearer ${state.token}` } }, { destroy: destroyGood });
    expect(destroyGood).not.toHaveBeenCalled();
  });
});
