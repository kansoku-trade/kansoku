// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataAgeBadge, formatDataAge } from "./DataAgeBadge";

afterEach(() => {
  cleanup();
});

describe("formatDataAge", () => {
  it("reports 刚刚 for anything under a minute", () => {
    expect(formatDataAge(0)).toBe("数据为刚刚");
    expect(formatDataAge(59_000)).toBe("数据为刚刚");
  });

  it("reports minutes for anything under an hour", () => {
    expect(formatDataAge(60_000)).toBe("数据为 1 分钟前");
    expect(formatDataAge(59 * 60_000)).toBe("数据为 59 分钟前");
  });

  it("reports hours for anything under a day", () => {
    expect(formatDataAge(60 * 60_000)).toBe("数据为 1 小时前");
    expect(formatDataAge(23 * 60 * 60_000)).toBe("数据为 23 小时前");
  });

  it("reports days once a full day has passed", () => {
    expect(formatDataAge(24 * 60 * 60_000)).toBe("数据为 1 天前");
    expect(formatDataAge(3 * 24 * 60 * 60_000)).toBe("数据为 3 天前");
  });
});

describe("DataAgeBadge", () => {
  it("renders nothing when at is null or undefined", () => {
    const { container: c1 } = render(<DataAgeBadge at={null} />);
    expect(c1.textContent).toBe("");
    cleanup();
    const { container: c2 } = render(<DataAgeBadge at={undefined} />);
    expect(c2.textContent).toBe("");
  });

  it("renders the formatted age for a given timestamp", () => {
    render(<DataAgeBadge at={Date.now() - 5 * 60_000} />);
    expect(screen.getByText("数据为 5 分钟前")).toBeTruthy();
  });

  it("ticks the displayed age forward while mounted", async () => {
    vi.useFakeTimers();
    try {
      const at = Date.now() - 59_000;
      render(<DataAgeBadge at={at} />);
      expect(screen.getByText("数据为刚刚")).toBeTruthy();

      await act(async () => {
        await vi.advanceTimersByTimeAsync(30_000);
      });
      expect(screen.getByText("数据为 1 分钟前")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});
