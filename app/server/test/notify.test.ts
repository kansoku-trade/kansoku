import { describe, expect, it } from "vitest";
import { notificationScript, notificationsEnabled } from "../src/ai/notify.js";

describe("notificationsEnabled", () => {
  it("is on by default on darwin outside tests", () => {
    expect(notificationsEnabled({}, "darwin")).toBe(true);
  });

  it("is off on other platforms", () => {
    expect(notificationsEnabled({}, "linux")).toBe(false);
  });

  it("is off when AI_NOTIFY disables it", () => {
    for (const flag of ["0", "false", "off", "no", "OFF"]) {
      expect(notificationsEnabled({ AI_NOTIFY: flag }, "darwin")).toBe(false);
    }
  });

  it("is off under vitest", () => {
    expect(notificationsEnabled({ VITEST: "true" }, "darwin")).toBe(false);
  });
});

describe("notificationScript", () => {
  it("escapes double quotes and backslashes", () => {
    const script = notificationScript('MU "alert"', 'price \\ broke "stop"');
    expect(script).toBe('display notification "price \\\\ broke \\"stop\\"" with title "MU \\"alert\\""');
  });
});
