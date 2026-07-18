import { describe, expect, it } from "vitest";
import {
  applySpaFallback,
  createAppProtocolHandler,
  decideRoute,
  guardStaticPath,
  lookupMimeType,
  missingDistErrorHtml,
} from "@desktop/protocol/protocol.js";

describe("decideRoute", () => {
  it("routes everything to static with SPA fallback applied", () => {
    expect(decideRoute("app://-/index.html")).toEqual({ kind: "static", relativePath: "index.html" });
    expect(decideRoute("app://-/assets/app.js")).toEqual({ kind: "static", relativePath: "assets/app.js" });
    expect(decideRoute("app://-/charts/1")).toEqual({ kind: "static", relativePath: "index.html" });
    expect(decideRoute("app://-/")).toEqual({ kind: "static", relativePath: "index.html" });
  });

  it("falls back popout routes to index.html even when the last segment has a dot", () => {
    expect(decideRoute("app://-/popout/symbol/NVDA.US")).toEqual({
      kind: "static",
      relativePath: "index.html",
    });
    expect(decideRoute("app://-/popout/symbol/700.HK")).toEqual({
      kind: "static",
      relativePath: "index.html",
    });
  });

  it("blocks traversal attempts that survive URL normalization", () => {
    // Plain "../" and even "%2e%2e/" segments never reach decideRoute as
    // literal ".." — the WHATWG URL parser already collapses dot-segments
    // (recognizing %2e as "." during segment splitting) against the root
    // before pathname is read, so those can't escape on their own. The real
    // attack surface is a "/" encoded as %2f, which keeps a dot-segment
    // fused into one opaque path component that URL parsing does not split
    // and therefore does not normalize — that only gets caught by our own
    // decode-then-normalize guard.
    expect(decideRoute("app://-/assets/%2e%2e%2f%2e%2e%2fetc/passwd")).toEqual({ kind: "blocked" });
    expect(decideRoute("app://-/..\\..\\etc\\passwd")).toEqual({ kind: "blocked" });
  });

  it("blocks malformed percent-encoding instead of throwing", () => {
    expect(decideRoute("app://-/%zz")).toEqual({ kind: "blocked" });
    expect(decideRoute("app://-/%")).toEqual({ kind: "blocked" });
    expect(decideRoute("app://-/%c0%ae")).toEqual({ kind: "blocked" });
  });
});

describe("guardStaticPath", () => {
  it("normalizes plain relative paths", () => {
    expect(guardStaticPath("/assets/app.js")).toBe("assets/app.js");
    expect(guardStaticPath("/")).toBe("index.html");
    expect(guardStaticPath("")).toBe("index.html");
  });

  it("rejects dot-dot traversal in any form", () => {
    expect(guardStaticPath("/../secret")).toBeNull();
    expect(guardStaticPath("/a/../../secret")).toBeNull();
    expect(guardStaticPath("/a/../../../secret")).toBeNull();
  });

  it("rejects backslash-based traversal", () => {
    expect(guardStaticPath("/..\\..\\secret")).toBeNull();
  });

  it("rejects absolute filesystem paths smuggled through the pathname", () => {
    expect(guardStaticPath("/C:/secret")).toBeNull();
  });
});

describe("applySpaFallback", () => {
  it("falls back extensionless paths to index.html", () => {
    expect(applySpaFallback("charts/1")).toBe("index.html");
    expect(applySpaFallback("settings")).toBe("index.html");
  });

  it("leaves paths with a file extension untouched", () => {
    expect(applySpaFallback("assets/app.js")).toBe("assets/app.js");
    expect(applySpaFallback("index.html")).toBe("index.html");
  });

  it("falls back popout routes to index.html regardless of a dotted last segment", () => {
    expect(applySpaFallback("popout/symbol/NVDA.US")).toBe("index.html");
    expect(applySpaFallback("popout/symbol/700.HK")).toBe("index.html");
    expect(applySpaFallback("popout")).toBe("index.html");
  });
});

describe("lookupMimeType", () => {
  it.each([
    ["/index.html", "text/html; charset=utf-8"],
    ["/assets/app.js", "text/javascript; charset=utf-8"],
    ["/assets/app.css", "text/css; charset=utf-8"],
    ["/data.json", "application/json; charset=utf-8"],
    ["/icon.svg", "image/svg+xml"],
    ["/logo.png", "image/png"],
    ["/font.woff2", "font/woff2"],
    ["/unknown.xyz", "application/octet-stream"],
  ])("maps %s -> %s", (path, mime) => {
    expect(lookupMimeType(path)).toBe(mime);
  });
});

describe("missingDistErrorHtml", () => {
  it("names the missing dist root and the build command", () => {
    const html = missingDistErrorHtml("/tmp/dist");
    expect(html).toContain("/tmp/dist");
    expect(html).toContain("pnpm --filter @kansoku/web build");
  });
});

describe("createAppProtocolHandler", () => {
  it("blocks encoded traversal attempts with 403", async () => {
    const handler = createAppProtocolHandler({
      distRoot: "/dist",
      distRootExists: () => true,
    });
    const response = await handler(new Request("app://-/assets/%2e%2e%2f%2e%2e%2fsecret"));
    expect(response.status).toBe(403);
  });

  it("blocks malformed percent-encoding with 403 instead of rejecting", async () => {
    const handler = createAppProtocolHandler({
      distRoot: "/dist",
      distRootExists: () => true,
    });
    const response = await handler(new Request("app://-/%zz"));
    expect(response.status).toBe(403);
  });

  it("rejects non-GET/HEAD static requests", async () => {
    const handler = createAppProtocolHandler({
      distRoot: "/dist",
      distRootExists: () => true,
    });
    const response = await handler(new Request("app://-/index.html", { method: "POST" }));
    expect(response.status).toBe(405);
  });

  it("serves the missing-dist error page instead of throwing when dist is absent", async () => {
    const handler = createAppProtocolHandler({
      distRoot: "/nowhere",
      distRootExists: () => false,
    });
    const response = await handler(new Request("app://-/index.html"));
    expect(response.status).toBe(503);
    const text = await response.text();
    expect(text).toContain("/nowhere");
  });

  it("404s a static file that does not exist under an existing dist root", async () => {
    const handler = createAppProtocolHandler({
      distRoot: "/tmp/definitely-not-here-desktop-test",
      distRootExists: () => true,
    });
    const response = await handler(new Request("app://-/missing.js"));
    expect(response.status).toBe(404);
  });
});
