export const DIRECTION_LABEL: Record<string, string> = {
  long: '📈 做多',
  short: '📉 做空',
  neutral: '🤔 观望',
};

const DIRECTION_TONE: Record<string, 'up' | 'down'> = { long: 'up', short: 'down' };

export function directionTone(direction: string | null | undefined): 'up' | 'down' | undefined {
  return direction ? DIRECTION_TONE[direction] : undefined;
}
