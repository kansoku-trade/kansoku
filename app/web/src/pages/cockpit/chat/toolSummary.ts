const MAX_SUMMARY_LENGTH = 80;

export function summarizeToolInput(input?: string): string {
  if (!input) return "";
  const firstLine = input.split("\n")[0]?.trim() ?? "";
  if (firstLine.length <= MAX_SUMMARY_LENGTH) return firstLine;
  return `${firstLine.slice(0, MAX_SUMMARY_LENGTH - 1)}…`;
}

export function toolRowKey(scope: string, id: string): string {
  return `${scope}:${id}`;
}
