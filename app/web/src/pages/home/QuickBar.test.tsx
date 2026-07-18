// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const navigate = vi.fn();

vi.mock("../../router", () => ({
  navigate: (...args: unknown[]) => navigate(...args),
}));

const { QuickBar } = await import("./QuickBar");

afterEach(() => {
  cleanup();
  navigate.mockReset();
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
});
