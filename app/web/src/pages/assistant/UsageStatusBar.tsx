import type { ChatUsage } from "../cockpit/chat/useChatSession";
import { formatUsageLine } from "./assistantStatusBar.js";

export function UsageStatusBar({ modelName, usage }: { modelName: string | null; usage: ChatUsage | null }) {
  const line = formatUsageLine(modelName, usage);
  const label = line ?? modelName;
  if (!label) return null;
  return <div className="assistant-usage-bar">{label}</div>;
}
