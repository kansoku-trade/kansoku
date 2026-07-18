import { theme } from "../../theme";

export const DIRECTION_LABEL: Record<string, string> = { long: "📈 做多", short: "📉 做空", neutral: "🤔 观望" };
export const DIRECTION_COLOR: Record<string, string> = { long: theme.up, short: theme.down, neutral: theme.textSecondary };

const DIRECTION_TONE: Record<string, "up" | "down"> = { long: "up", short: "down" };

export function directionTone(direction: string | null | undefined): "up" | "down" | undefined {
  return direction ? DIRECTION_TONE[direction] : undefined;
}
