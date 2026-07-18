const GRID_STEP_MS = 15 * 60 * 1000;
export const ARCHIVE_WINDOW_HOURS = 48;

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function formatArchiveStamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}`;
}

export function enumerateArchiveGrid(cutoffIso: string, windowHours: number = ARCHIVE_WINDOW_HOURS): string[] {
  const cutoffMs = Date.parse(cutoffIso);
  if (cutoffMs % GRID_STEP_MS !== 0) {
    throw new Error(`cutoff is not aligned to the GDELT 15-minute grid: ${cutoffIso}`);
  }
  const startMs = cutoffMs - windowHours * 60 * 60 * 1000;

  const stamps: string[] = [];
  for (let ms = startMs + GRID_STEP_MS; ms <= cutoffMs; ms += GRID_STEP_MS) {
    stamps.push(formatArchiveStamp(ms));
  }
  return stamps;
}

export function archiveCachePeriod(cutoffIso: string): string {
  return `news-gdelt-arch-${formatArchiveStamp(Date.parse(cutoffIso))}`;
}

export function archiveFileUrl(stamp: string): string {
  return `http://data.gdeltproject.org/gdeltv2/${stamp}.gkg.csv.zip`;
}
