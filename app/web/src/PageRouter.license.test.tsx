// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLicenseModalStateForTests, resetLicenseModalStoreForTests } from "./licenseModalStore";
import { Router } from "./PageRouter";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };

vi.mock("./capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("./pages/research/ResearchPage", () => ({
  ResearchPage: () => <div data-testid="research-page" />,
}));
vi.mock("./pages/assistant/AssistantChatPage", () => ({
  AssistantChatPage: () => <div data-testid="chat-page" />,
}));

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
  capabilities = { pro: null, licensed: false };
  resetLicenseModalStoreForTests();
});

describe("Router AI-route licensing gate", () => {
  it("renders the pro-unavailable page when pro is false, unchanged from before licensing", () => {
    capabilities = { pro: false, licensed: false };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.getByText("此构建不含 AI 功能")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders a neutral empty state (not the pro-unavailable page) and auto-opens the license modal once for /research when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.queryByText("此构建不含 AI 功能")).toBeNull();
    expect(screen.getByText("需要有效授权才能使用该功能")).toBeTruthy();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("renders the neutral empty state and auto-opens the license modal for /chat when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    window.history.replaceState({}, "", "/chat");

    render(<Router />);

    expect(screen.getByText("需要有效授权才能使用该功能")).toBeTruthy();
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("renders the real research page when pro and licensed", () => {
    capabilities = { pro: true, licensed: true };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.getByTestId("research-page")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
