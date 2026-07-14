import { afterEach, describe, expect, it, vi } from "vitest";
import { __setActiveRouteStore, createMemoryRouteStore, navigate, resolveAnchorRoute, routePathname } from "./router.js";

afterEach(() => {
  __setActiveRouteStore(null);
});

describe("createMemoryRouteStore", () => {
  it("starts at the initial route", () => {
    const store = createMemoryRouteStore("/symbol/NVDA");
    expect(store.getRoute()).toBe("/symbol/NVDA");
  });

  it("push updates the route and notifies subscribers", () => {
    const store = createMemoryRouteStore("/");
    const cb = vi.fn();
    store.subscribe(cb);
    store.push("/settings");
    expect(store.getRoute()).toBe("/settings");
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it("push with the same route is a no-op", () => {
    const store = createMemoryRouteStore("/");
    const cb = vi.fn();
    store.subscribe(cb);
    store.push("/");
    expect(cb).not.toHaveBeenCalled();
  });

  it("calls onChange for both push and replace", () => {
    const onChange = vi.fn();
    const store = createMemoryRouteStore("/", { onChange });
    store.push("/a");
    store.replace("/b");
    expect(onChange).toHaveBeenCalledWith("/a");
    expect(onChange).toHaveBeenCalledWith("/b");
  });

  it("unsubscribe stops notifications", () => {
    const store = createMemoryRouteStore("/");
    const cb = vi.fn();
    const unsubscribe = store.subscribe(cb);
    unsubscribe();
    store.push("/a");
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("routePathname", () => {
  it("keeps analysis query parameters out of the symbol route", () => {
    expect(routePathname("/symbol/DRAM.US?analysis=2026-07-13-dram-intraday")).toBe("/symbol/DRAM.US");
  });

  it("preserves percent-encoded question marks inside path segments", () => {
    expect(routePathname("/charts/chart%3Fid?view=compact")).toBe("/charts/chart%3Fid");
  });
});

describe("resolveAnchorRoute", () => {
  it("routes durable localhost chart links inside both web and packaged app runtimes", () => {
    const href = "http://localhost:5199/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3";
    expect(resolveAnchorRoute(href, href, "http://localhost:5199")).toBe(
      "/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3",
    );
    expect(resolveAnchorRoute(href, href, "null")).toBe(
      "/symbol/DRAM.US?analysis=2026-07-09-dram-intraday-3",
    );
  });

  it("keeps ordinary relative navigation working under app://", () => {
    expect(resolveAnchorRoute("/settings", "app://-/settings", "null")).toBe("/settings");
  });

  it("leaves external protocols to the browser or Electron navigation guard", () => {
    expect(resolveAnchorRoute("https://example.com", "https://example.com/", "null")).toBeNull();
    expect(resolveAnchorRoute("mailto:test@example.com", "mailto:test@example.com", "null")).toBeNull();
  });
});

describe("navigate against an active store", () => {
  it("pushes onto the active store instead of window.location", () => {
    const store = createMemoryRouteStore("/");
    __setActiveRouteStore(store);
    navigate("/symbol/MRVL");
    expect(store.getRoute()).toBe("/symbol/MRVL");
  });

  it("replace option calls replace on the active store", () => {
    const store = createMemoryRouteStore("/");
    const replaceSpy = vi.spyOn(store, "replace");
    __setActiveRouteStore(store);
    navigate("/settings", { replace: true });
    expect(replaceSpy).toHaveBeenCalledWith("/settings");
  });

  it("does nothing when the route is unchanged", () => {
    const store = createMemoryRouteStore("/settings");
    const cb = vi.fn();
    store.subscribe(cb);
    __setActiveRouteStore(store);
    navigate("/settings");
    expect(cb).not.toHaveBeenCalled();
  });
});
