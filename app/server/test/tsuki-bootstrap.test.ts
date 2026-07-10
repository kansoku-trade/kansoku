import { Controller, Get, Module } from "@tsuki-hono/common";
import { createApplication } from "@tsuki-hono/core";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AppExceptionFilter } from "../src/filters/app-exception.filter.js";
import { ClientError } from "../src/errors.js";
import { CHART_DATA_DIR, PORT } from "../src/env.js";
import { tsukiRequest } from "./helpers.js";

describe("tsuki bootstrap", () => {
  it("GET /api/health returns the status envelope", async () => {
    const res = await tsukiRequest("/api/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      data: { status: "up", port: PORT, dataDir: CHART_DATA_DIR },
    });
  });
});

describe("tsuki exception filter", () => {
  @Controller("test-errors")
  class TestErrorsController {
    @Get("/client")
    throwClient() {
      throw new ClientError("bad input", "try again", 422);
    }

    @Get("/unknown")
    throwUnknown() {
      throw new Error("boom");
    }
  }

  @Module({ controllers: [TestErrorsController] })
  class TestErrorsModule {}

  let app: Awaited<ReturnType<typeof createApplication>>;

  afterAll(async () => {
    await app?.close?.();
  });

  it("maps ClientError to its status and envelope", async () => {
    app = await createApplication(TestErrorsModule, { globalPrefix: "/api" });
    app.useGlobalFilters(new AppExceptionFilter());

    const res = await app.getInstance().request("/api/test-errors/client");
    expect(res.status).toBe(422);
    expect(await res.json()).toEqual({ ok: false, error: "bad input", hint: "try again" });
  });

  it("maps unknown errors to a 500 envelope", async () => {
    app = await createApplication(TestErrorsModule, { globalPrefix: "/api" });
    app.useGlobalFilters(new AppExceptionFilter());

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await app.getInstance().request("/api/test-errors/unknown");
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ ok: false, error: "boom" });
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
