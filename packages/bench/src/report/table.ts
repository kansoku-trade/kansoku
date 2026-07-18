export function renderTable(headers: string[], rows: string[][]): string[] {
  const lines: string[] = [];
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines;
}
