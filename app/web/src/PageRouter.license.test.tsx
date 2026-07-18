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

describe("Router AI routes render unconditionally", () => {
  it("renders the real research page for a community build (pro:false)", () => {
    capabilities = { pro: false, licensed: false };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.getByTestId("research-page")).toBeTruthy();
    expect(screen.queryByText("此构建不含 AI 功能")).toBeNull();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders the real chat page for a community build (pro:false)", () => {
    capabilities = { pro: false, licensed: false };
    window.history.replaceState({}, "", "/chat");

    render(<Router />);

    expect(screen.getByTestId("chat-page")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders the real research page when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.getByTestId("research-page")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders the real chat page when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    window.history.replaceState({}, "", "/chat");

    render(<Router />);

    expect(screen.getByTestId("chat-page")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("renders the real research page when pro and licensed", () => {
    capabilities = { pro: true, licensed: true };
    window.history.replaceState({}, "", "/research");

    render(<Router />);

    expect(screen.getByTestId("research-page")).toBeTruthy();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });
});
