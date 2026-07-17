// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { getLicenseModalStateForTests, resetLicenseModalStoreForTests } from "../../licenseModalStore";

let capabilities: { pro: boolean | null; licensed: boolean } = { pro: null, licensed: false };
const navigate = vi.fn();

vi.mock("../../capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("../../router", () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}));

const { QuickBar } = await import("./QuickBar");

afterEach(() => {
  cleanup();
  capabilities = { pro: null, licensed: false };
  navigate.mockReset();
  resetLicenseModalStoreForTests();
});

describe("QuickBar AI entry lock affordance", () => {
  it("hides the research/chat icons for a community build (pro:false)", () => {
    capabilities = { pro: false, licensed: false };
    render(<QuickBar shortcuts={[]} />);

    expect(screen.queryByLabelText("研究库")).toBeNull();
    expect(screen.queryByLabelText("AI 对话")).toBeNull();
    expect(screen.queryByLabelText(/需订阅授权/)).toBeNull();
  });

  it("renders a native anchor (not a guarded button) for the licensed case, preserving ctrl/middle-click and right-click", () => {
    capabilities = { pro: true, licensed: true };
    render(<QuickBar shortcuts={[]} />);

    const research = screen.getByLabelText("研究库");
    const chat = screen.getByLabelText("AI 对话");

    expect(research.tagName).toBe("A");
    expect(research.getAttribute("href")).toBe("/research?view=journal");
    expect(chat.tagName).toBe("A");
    expect(chat.getAttribute("href")).toBe("/chat");

    fireEvent.click(research);

    expect(navigate).not.toHaveBeenCalled();
    expect(getLicenseModalStateForTests().open).toBe(false);
  });

  it("opens the license modal instead of navigating when pro but unlicensed", () => {
    capabilities = { pro: true, licensed: false };
    render(<QuickBar shortcuts={[]} />);

    fireEvent.click(screen.getByLabelText("研究库（需订阅授权）"));

    expect(navigate).not.toHaveBeenCalledWith("/research?view=journal");
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });

  it("opens the license modal for the locked chat entry too", () => {
    capabilities = { pro: true, licensed: false };
    render(<QuickBar shortcuts={[]} />);

    fireEvent.click(screen.getByLabelText("AI 对话（需订阅授权）"));

    expect(navigate).not.toHaveBeenCalledWith("/chat");
    expect(getLicenseModalStateForTests()).toEqual({ open: true, trigger: "guard" });
  });
});
