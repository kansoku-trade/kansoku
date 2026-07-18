import { chartTargetPath, type ChartUrlDoc } from "../../shared/chartUrl.js";
import { BASE_URL } from "./env.js";

export function chartUrl(doc: ChartUrlDoc): string {
  return `${BASE_URL}${chartTargetPath(doc)}`;
}
