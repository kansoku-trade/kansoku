import { chartTargetPath, type ChartUrlDoc } from "@kansoku/shared/chartUrl";
import { BASE_URL } from "./env.js";

export function chartUrl(doc: ChartUrlDoc): string {
  return `${BASE_URL}${chartTargetPath(doc)}`;
}
