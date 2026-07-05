import { execFile } from "node:child_process";

const DISABLED_VALUES = new Set(["0", "false", "off", "no"]);

export function notificationsEnabled(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): boolean {
  if (platform !== "darwin") return false;
  if (env.VITEST || env.NODE_ENV === "test") return false;
  const flag = (env.AI_NOTIFY ?? "").toLowerCase();
  return !DISABLED_VALUES.has(flag);
}

export function notificationScript(title: string, message: string): string {
  const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `display notification "${esc(message)}" with title "${esc(title)}"`;
}

export function notifyUser(title: string, message: string): void {
  if (!notificationsEnabled()) return;
  execFile("osascript", ["-e", notificationScript(title, message)], (err) => {
    if (err) console.error("[notify] osascript failed:", err.message);
  });
}
