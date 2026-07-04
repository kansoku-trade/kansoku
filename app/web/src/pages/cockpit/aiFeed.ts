import type { CockpitComment } from "../../../../shared/types";

export type FeedRow =
  | { kind: "comment"; comment: CockpitComment }
  | { kind: "fold"; id: string; from: string; to: string; count: number; comments: CockpitComment[] };

const FOLD_MIN = 3;

function foldable(c: CockpitComment): boolean {
  return c.level === "info" && c.source === "commentator";
}

export function buildFeed(comments: CockpitComment[]): FeedRow[] {
  const rows: FeedRow[] = [];
  let run: CockpitComment[] = [];

  const flush = () => {
    if (run.length >= FOLD_MIN) {
      const first = run[0];
      const last = run[run.length - 1];
      rows.push({ kind: "fold", id: first.ts, from: first.ts, to: last.ts, count: run.length, comments: run });
    } else {
      for (const c of run) rows.push({ kind: "comment", comment: c });
    }
    run = [];
  };

  for (const c of comments) {
    if (foldable(c)) {
      run.push(c);
    } else {
      flush();
      rows.push({ kind: "comment", comment: c });
    }
  }
  flush();
  return rows;
}
