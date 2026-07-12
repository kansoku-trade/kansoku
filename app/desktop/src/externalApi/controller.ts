import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import type { IncomingMessage, Server } from "node:http";
import { createServer } from "node:net";
import { join } from "node:path";
import { serve } from "@hono/node-server";
import { app } from "electron";
import { attachWs } from "../../../server/src/realtime/wsHost.js";

export const BASE_PORT = 5199;
export const MAX_PORT_ATTEMPTS = 11;
export const WS_PATH = "/api/ws";
export const EXEMPT_PATHS = new Set(["/api/health"]);

export interface PersistedExternalApiState {
  enabled: boolean;
  token: string | null;
}

export interface ExternalApiSnapshot {
  enabled: boolean;
  port: number | null;
  token: string | null;
}

const EMPTY_STATE: PersistedExternalApiState = { enabled: false, token: null };

export function generateToken(): string {
  return randomBytes(24).toString("base64url");
}

export function unauthorizedResponse(): Response {
  return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
}

// Hashing both sides to a fixed-length digest before comparing means the
// buffers passed to timingSafeEqual are always the same length (32 bytes),
// so there's no length-mismatch throw path to branch on — a plain ===/!==
// (or a length check before comparing) would let an attacker infer the
// token's length or a byte-by-byte prefix match from response timing.
function timingSafeTokenEqual(a: string, b: string): boolean {
  const digestA = createHash("sha256").update(a).digest();
  const digestB = createHash("sha256").update(b).digest();
  return timingSafeEqual(digestA, digestB);
}

export function createGatedFetch(
  kernelFetch: (request: Request) => Promise<Response>,
  getToken: () => string | null,
  exemptPaths: Set<string> = EXEMPT_PATHS,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const { pathname } = new URL(request.url);
    if (exemptPaths.has(pathname)) return kernelFetch(request);

    const token = getToken();
    if (!token) return unauthorizedResponse();

    const header = request.headers.get("authorization");
    if (!header || !timingSafeTokenEqual(header, `Bearer ${token}`)) return unauthorizedResponse();

    return kernelFetch(request);
  };
}

export function isAuthorizedWsRequest(req: Pick<IncomingMessage, "headers">, token: string | null): boolean {
  if (!token) return false;
  const header = req.headers.authorization;
  if (!header) return false;
  return timingSafeTokenEqual(header, `Bearer ${token}`);
}

export async function findAvailablePort(
  basePort: number,
  maxAttempts: number,
  isPortTaken: (port: number) => Promise<boolean>,
): Promise<number | null> {
  for (let offset = 0; offset < maxAttempts; offset++) {
    const port = basePort + offset;
    if (!(await isPortTaken(port))) return port;
  }
  return null;
}

export function defaultIsPortTaken(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createServer();
    probe.once("error", () => resolve(true));
    probe.once("listening", () => probe.close(() => resolve(false)));
    probe.listen(port, "127.0.0.1");
  });
}

export interface ExternalApiFileStore {
  readState(): Promise<PersistedExternalApiState>;
  writeState(state: PersistedExternalApiState): Promise<void>;
}

export function createExternalApiFileStore(filePath: string): ExternalApiFileStore {
  return {
    async readState() {
      try {
        const raw = await readFile(filePath, "utf8");
        const parsed = JSON.parse(raw) as Partial<PersistedExternalApiState>;
        return {
          enabled: parsed.enabled === true,
          token: typeof parsed.token === "string" ? parsed.token : null,
        };
      } catch {
        return { ...EMPTY_STATE };
      }
    },
    async writeState(state) {
      await writeFile(filePath, JSON.stringify(state), { mode: 0o600 });
      await chmod(filePath, 0o600);
    },
  };
}

export interface ServerLike {
  on(event: "upgrade", listener: (req: IncomingMessage, socket: { destroy(): void }, head: Buffer) => void): unknown;
}

export interface ExternalApiControllerDeps {
  kernelFetch: (request: Request) => Promise<Response>;
  serve: (
    options: { fetch: (request: Request) => Promise<Response>; port: number; hostname: string },
    callback?: () => void,
  ) => ServerLike;
  attachWs: (server: ServerLike, path: string) => unknown;
  closeServer: (server: ServerLike) => Promise<void>;
  isPortTaken: (port: number) => Promise<boolean>;
  store: ExternalApiFileStore;
  generateToken: () => string;
  log?: (message: string) => void;
}

export class ExternalApiController {
  private server: ServerLike | null = null;
  private state: ExternalApiSnapshot = { enabled: false, port: null, token: null };

  constructor(private deps: ExternalApiControllerDeps) {}

  getState(): ExternalApiSnapshot {
    return { ...this.state };
  }

  async boot(): Promise<ExternalApiSnapshot> {
    const persisted = await this.deps.store.readState();
    this.state = { enabled: false, port: null, token: persisted.token };
    if (persisted.enabled && persisted.token) {
      try {
        await this.start(persisted.token);
      } catch (err) {
        this.deps.log?.(`boot: failed to re-enable (${(err as Error).message})`);
      }
    }
    return this.getState();
  }

  async enable(): Promise<ExternalApiSnapshot> {
    if (this.state.enabled) return this.getState();
    // Only mint a fresh token the first time this ever gets enabled — a
    // disable/enable cycle keeps using the same token so a CLI/skill
    // consumer doesn't need to re-copy it after every toggle.
    const token = this.state.token ?? this.deps.generateToken();
    await this.start(token);
    await this.persist();
    return this.getState();
  }

  async disable(): Promise<ExternalApiSnapshot> {
    await this.stop();
    this.state = { enabled: false, port: null, token: this.state.token };
    await this.persist();
    return this.getState();
  }

  async resetToken(): Promise<ExternalApiSnapshot> {
    const wasEnabled = this.state.enabled;
    await this.stop();
    const token = this.deps.generateToken();
    if (wasEnabled) {
      await this.start(token);
    } else {
      this.state = { enabled: false, port: null, token };
    }
    await this.persist();
    return this.getState();
  }

  async shutdown(): Promise<void> {
    await this.stop();
  }

  private async start(token: string): Promise<void> {
    const port = await findAvailablePort(BASE_PORT, MAX_PORT_ATTEMPTS, this.deps.isPortTaken);
    if (port === null) {
      throw new Error(`no free port in ${BASE_PORT}-${BASE_PORT + MAX_PORT_ATTEMPTS - 1}`);
    }

    const gatedFetch = createGatedFetch(this.deps.kernelFetch, () => token);
    const server = this.deps.serve({ fetch: gatedFetch, port, hostname: "127.0.0.1" }, () => {
      this.deps.log?.(`external api listening on 127.0.0.1:${port}`);
    });
    server.on("upgrade", (req, socket) => {
      if (!isAuthorizedWsRequest(req, token)) socket.destroy();
    });
    this.deps.attachWs(server, WS_PATH);

    this.server = server;
    this.state = { enabled: true, port, token };
  }

  private async stop(): Promise<void> {
    if (!this.server) return;
    await this.deps.closeServer(this.server);
    this.server = null;
  }

  private async persist(): Promise<void> {
    await this.deps.store.writeState({ enabled: this.state.enabled, token: this.state.token });
  }
}

export function createExternalApiController(kernelFetch: (request: Request) => Promise<Response>): ExternalApiController {
  const filePath = join(app.getPath("userData"), "external-api.json");
  return new ExternalApiController({
    kernelFetch,
    serve: (options, callback) => serve(options, callback) as unknown as ServerLike,
    attachWs: (server, path) => attachWs(server as unknown as Server, path),
    closeServer: (server) =>
      new Promise((resolve) => (server as unknown as Server).close(() => resolve())),
    isPortTaken: defaultIsPortTaken,
    store: createExternalApiFileStore(filePath),
    generateToken,
    log: (message) => console.log(`[external-api] ${message}`),
  });
}
