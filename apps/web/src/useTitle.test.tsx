// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { __setActiveTitleSink, useTitle } from "./useTitle";

afterEach(() => {
  __setActiveTitleSink(null);
  document.title = "";
});

describe("useTitle", () => {
  it("writes the page title to document and the active sink", () => {
    const sink = vi.fn();
    __setActiveTitleSink(sink);
    renderHook(() => useTitle("NOW.US 短线多周期"));

    expect(document.title).toBe("NOW.US 短线多周期 · Kansoku");
    expect(sink).toHaveBeenCalledWith("NOW.US 短线多周期");
  });

  it("falls back to the brand for null", () => {
    const sink = vi.fn();
    __setActiveTitleSink(sink);
    renderHook(() => useTitle(null));

    expect(document.title).toBe("Kansoku");
    expect(sink).toHaveBeenCalledWith("Kansoku");
  });

  it("leaves document and sink untouched while the title is undefined", () => {
    const sink = vi.fn();
    __setActiveTitleSink(sink);
    document.title = "previous";
    const { rerender } = renderHook(({ title }: { title: string | undefined }) => useTitle(title), {
      initialProps: { title: undefined as string | undefined },
    });

    expect(document.title).toBe("previous");
    expect(sink).not.toHaveBeenCalled();

    rerender({ title: "resolved" });
    expect(document.title).toBe("resolved · Kansoku");
    expect(sink).toHaveBeenCalledTimes(1);
    expect(sink).toHaveBeenCalledWith("resolved");
  });
});
