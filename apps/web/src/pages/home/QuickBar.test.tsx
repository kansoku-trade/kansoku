// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();
const openLicenseModal = vi.fn();
const capabilities = { pro: false, licensed: false };

vi.mock("@web/router", () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}));
vi.mock("@web/capabilitiesStore", () => ({
  useCapabilities: () => capabilities,
}));
vi.mock("@web/licenseModalStore", () => ({
  openLicenseModal: (...args: unknown[]) => openLicenseModal(...args),
}));

const { QuickBar } = await import("./QuickBar");

afterEach(() => {
  cleanup();
  navigate.mockReset();
  openLicenseModal.mockReset();
  capabilities.pro = false;
  capabilities.licensed = false;
});

describe("QuickBar AI entries", () => {
  it("renders the research/chat icons unconditionally (free build)", () => {
    render(<QuickBar shortcuts={[]} />);

    const research = screen.getByLabelText("研究库");
    const chat = screen.getByLabelText("AI 对话");

    expect(research.tagName).toBe("A");
    expect(research.getAttribute("href")).toBe("/research?view=journal");
    expect(chat.tagName).toBe("A");
    expect(chat.getAttribute("href")).toBe("/chat");
  });

  it("hides the global actions when showGlobalActions is false", () => {
    render(<QuickBar shortcuts={[]} showGlobalActions={false} />);

    expect(screen.queryByLabelText("研究库")).toBeNull();
    expect(screen.queryByLabelText("AI 对话")).toBeNull();
    expect(screen.queryByLabelText("设置")).toBeNull();
  });

  it("shows the trial icon only when pro is present but unlicensed, opening the paywall", () => {
    capabilities.pro = true;
    render(<QuickBar shortcuts={[]} />);

    const trial = screen.getByLabelText("Kansoku AI");
    fireEvent.click(trial);

    expect(openLicenseModal).toHaveBeenCalledWith("guard");
  });

  it("hides the trial icon when licensed and on free builds", () => {
    capabilities.pro = true;
    capabilities.licensed = true;
    const { unmount } = render(<QuickBar shortcuts={[]} />);
    expect(screen.queryByLabelText("Kansoku AI")).toBeNull();
    unmount();

    capabilities.pro = false;
    capabilities.licensed = false;
    render(<QuickBar shortcuts={[]} />);
    expect(screen.queryByLabelText("Kansoku AI")).toBeNull();
  });
});
