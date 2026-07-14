import type { ResearchDocumentMeta, ResearchDocumentType, ResearchKind } from "../../../../packages/core/src/contract";

export type ResearchView = "stocks" | "journal";

const TYPE_LABELS: Record<ResearchDocumentType, string> = {
  stock: "股票档案",
  intraday: "日内分析",
  recap: "复盘",
  flow: "资金流",
  lessons: "交易教训",
  decision: "决策记录",
  archive: "归档",
  journal: "研究日志",
};

export function parseResearchView(value: string | null): ResearchView {
  return value === "stocks" ? "stocks" : "journal";
}

export function kindForView(view: ResearchView): ResearchKind {
  return view === "stocks" ? "stock" : "journal";
}

export function viewForKind(kind: ResearchKind): ResearchView {
  return kind === "stock" ? "stocks" : "journal";
}

export function researchTypeLabel(type: ResearchDocumentType): string {
  return TYPE_LABELS[type];
}

export function researchListTitle(meta: ResearchDocumentMeta): string {
  const date = meta.date;
  if (!date) return meta.title;

  const escapedDate = date.replaceAll("-", "\\-");
  const withoutLeadingDate = meta.title.replace(new RegExp(`^${escapedDate}(?:T|\\s)+`), "");
  const withoutTrailingDate = withoutLeadingDate.replace(new RegExp(`\\s*[—–-]\\s*${escapedDate}$`), "");
  const compactTime = withoutTrailingDate.replace(/^(\d{2}:\d{2})(?::\d{2})?Z?\b/, "$1");
  return compactTime.trim() || meta.title;
}

export function researchListSecondary(meta: ResearchDocumentMeta): string {
  return [researchTypeLabel(meta.type), meta.symbols.join(" · ")].filter(Boolean).join(" · ");
}

export function researchRoute(view: ResearchView, path?: string): string {
  const params = new URLSearchParams({ view });
  if (path) params.set("path", path);
  return `/research?${params.toString()}`;
}

export function relatedDocuments(
  selected: ResearchDocumentMeta,
  all: ResearchDocumentMeta[],
): ResearchDocumentMeta[] {
  const symbols = new Set(selected.symbols);
  if (symbols.size === 0) return [];
  return all
    .filter((document) => document.path !== selected.path && document.symbols.some((symbol) => symbols.has(symbol)))
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "stock" ? -1 : 1;
      return (b.date ?? b.mtime).localeCompare(a.date ?? a.mtime);
    });
}
