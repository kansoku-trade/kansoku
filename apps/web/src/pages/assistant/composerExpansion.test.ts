import { describe, expect, it } from "vitest";
import { shouldExpandComposer } from "./composerExpansion";

const idleState = {
  busy: false,
  focusedWithin: false,
  hasHint: false,
  hasReferences: false,
  hasText: false,
  modelPickerOpen: false,
  queueLength: 0,
};

describe("assistant composer expansion", () => {
  it("stays expanded while the portaled model picker is open after the textarea loses focus", () => {
    expect(shouldExpandComposer({ ...idleState, modelPickerOpen: true })).toBe(true);
  });

  it("collapses only after focus and the model picker have both closed", () => {
    expect(shouldExpandComposer(idleState)).toBe(false);
    expect(shouldExpandComposer({ ...idleState, focusedWithin: true })).toBe(true);
  });
});
