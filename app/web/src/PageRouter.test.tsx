// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Router } from "./PageRouter";

vi.mock("./pages/Home", () => ({ Home: () => <div data-testid="home" /> }));
vi.mock("./pages/SymbolCockpit", () => ({
  SymbolCockpit: ({ sym }: { sym: string }) => <div data-testid="symbol-cockpit">{sym}</div>,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Router symbol routes", () => {
  it("passes the canonical symbol to the cockpit", () => {
    window.history.replaceState({}, "", "/symbol/mu?analysis=latest");

    render(<Router />);

    expect(screen.getByTestId("symbol-cockpit").textContent).toBe("MU.US");
  });

  it("does not crash on a malformed encoded symbol", () => {
    window.history.replaceState({}, "", "/symbol/%ZZ");

    render(<Router />);

    expect(screen.getByTestId("home")).toBeTruthy();
  });
});
