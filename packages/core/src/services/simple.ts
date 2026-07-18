import type { CohortPoint, FlowRow } from "../../../shared/types.js";
import { ClientError } from "../errors.js";

export type { FlowRow };

export interface CohortRow {
  symbol?: string;
  label?: string;
  value: string | number;
  group?: string;
}

export function cleanCohortRows(rows: CohortRow[]): CohortPoint[] {
  const cleaned = rows.map((row) => {
    const label = row.label ?? row.symbol;
    if (label == null) {
      throw new ClientError("cohort rows need `label` or `symbol`", `offending row: ${JSON.stringify(row)}`);
    }
    return { label: String(label), value: Number(row.value) };
  });
  cleaned.sort((a, b) => a.value - b.value);
  return cleaned;
}
