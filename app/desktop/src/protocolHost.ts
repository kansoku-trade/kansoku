import { readFile } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { protocol } from "electron";

export const APP_SCHEME = "app";

export function registerAppScheme(): void {
  protocol.registerSchemesAsPrivileged([
    {
      scheme: APP_SCHEME,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        stream: true,
        corsEnabled: true,
      },
    },
  ]);
}

export type RouteDecision =
  | { kind: "kernel" }
  | { kind: "static"; relativePath: string }
  | { kind: "blocked" };

// app://-/... always carries a host of "-"; the pathname after it is the
// real route. `/api*` goes to the kernel, everything else resolves against
// the static web build with SPA fallback for extensionless paths.
export function decideRoute(requestUrl: string): RouteDecision {
  const url = new URL(requestUrl);

  // decodeURIComponent throws on malformed percent-encoding (bare "%",
  // "%zz", or invalid UTF-8 byte sequences like "%c0%ae") — treat that as
  // a blocked request rather than letting the exception escape as an
  // unhandled rejection.
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return { kind: "blocked" };
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return { kind: "kernel" };
  }

  const guarded = guardStaticPath(pathname);
  if (guarded === null) return { kind: "blocked" };

  return { kind: "static", relativePath: applySpaFallback(guarded) };
}

// Rejects any path that would escape the dist root after normalization —
// "..", encoded traversal, absolute paths, and backslash segments all
// collapse to this same check since `pathname` is already decoded and
// path-separator-normalized by `normalize`.
export function guardStaticPath(pathname: string): string | null {
  const withoutLeadingSlash = pathname.replace(/^\/+/, "");
  const withForwardSlashes = withoutLeadingSlash.replace(/\\/g, "/");
  const normalized = normalize(withForwardSlashes);

  if (normalized === "." || normalized === "") return "index.html";
  if (normalized.startsWith("..") || normalized.split(sep).includes("..")) return null;
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;

  return normalized;
}

export function applySpaFallback(relativePath: string): string {
  if (extname(relativePath) !== "") return relativePath;
  return "index.html";
}

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".map": "application/json; charset=utf-8",
};

export function lookupMimeType(pathname: string): string {
  return MIME_TYPES[extname(pathname).toLowerCase()] ?? "application/octet-stream";
}

export function missingDistErrorHtml(distRoot: string): string {
  return `<!doctype html><title>trade — web build missing</title><body style="font:14px system-ui;padding:2rem">
  <h1>Web build not found</h1>
  <p>Expected a built web app at:</p>
  <pre>${distRoot}</pre>
  <p>Run <code>pnpm --filter @trade/web build</code> and relaunch.</p>
  </body>`;
}

export interface ProtocolHostDeps {
  kernelFetch: (request: Request) => Promise<Response>;
  distRoot: string;
  distRootExists: () => boolean;
}

export function createAppProtocolHandler(deps: ProtocolHostDeps) {
  return async function handleAppRequest(request: Request): Promise<Response> {
    const decision = decideRoute(request.url);

    if (decision.kind === "kernel") {
      return deps.kernelFetch(request);
    }

    if (decision.kind === "blocked") {
      return new Response("Forbidden", { status: 403 });
    }

    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    if (!deps.distRootExists()) {
      return new Response(missingDistErrorHtml(deps.distRoot), {
        status: 503,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }

    const filePath = join(deps.distRoot, decision.relativePath);
    try {
      const body = await readFile(filePath);
      return new Response(new Uint8Array(body), {
        status: 200,
        headers: { "content-type": lookupMimeType(filePath) },
      });
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  };
}

export function registerAppProtocolHandler(deps: ProtocolHostDeps): void {
  const handler = createAppProtocolHandler(deps);
  protocol.handle(APP_SCHEME, handler);
}
