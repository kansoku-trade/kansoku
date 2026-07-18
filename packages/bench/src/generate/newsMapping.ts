import type { BenchNewsItem } from "../schema/newsItem.js";

export interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language?: string;
  sourcecountry?: string;
}

export interface EdgarFiling {
  form: string;
  filingDate: string;
  primaryDocument: string;
  accessionNumber: string;
}

const GDELT_MAX_ITEMS = 10;
const EDGAR_FORMS = new Set(["8-K", "10-Q", "10-K"]);

export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\w ]/g, "");
}

function gdeltSeenDateToIso(seendate: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(seendate);
  if (!match) throw new Error(`unrecognized GDELT seendate: ${seendate}`);
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export function hashSlug(value: string): string {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = (hash * 33) ^ value.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

export function mapGdeltArticles(articles: GdeltArticle[], cutoffIso: string): BenchNewsItem[] {
  const cutoffMs = Date.parse(cutoffIso);
  const seenTitles = new Set<string>();
  const candidates: { item: BenchNewsItem; ms: number }[] = [];

  for (const article of articles) {
    const publishedAt = gdeltSeenDateToIso(article.seendate);
    const ms = Date.parse(publishedAt);
    if (ms > cutoffMs) continue;

    const normalized = normalizeTitle(article.title);
    if (seenTitles.has(normalized)) continue;
    seenTitles.add(normalized);

    candidates.push({
      ms,
      item: {
        id: `gdelt-${hashSlug(article.url)}`,
        title: article.title.trim(),
        published_at: publishedAt,
        url: article.url,
        source: `gdelt:${article.domain}`,
      },
    });
  }

  candidates.sort((a, b) => b.ms - a.ms);
  return candidates.slice(0, GDELT_MAX_ITEMS).map((candidate) => candidate.item);
}

export function edgarDocumentUrl(cik: string, accessionNumber: string, primaryDocument: string): string {
  const cikNoPadding = String(Number(cik));
  const accessionNoDashes = accessionNumber.replace(/-/g, "");
  return `https://www.sec.gov/Archives/edgar/data/${cikNoPadding}/${accessionNoDashes}/${primaryDocument}`;
}

export function mapEdgarFilings(
  filings: EdgarFiling[],
  cutoffIso: string,
  cik: string,
  startDate: string,
  endDate: string,
): BenchNewsItem[] {
  const cutoffMs = Date.parse(cutoffIso);
  const candidates: { item: BenchNewsItem; ms: number }[] = [];

  for (const filing of filings) {
    if (!EDGAR_FORMS.has(filing.form)) continue;
    if (filing.filingDate < startDate || filing.filingDate > endDate) continue;

    const publishedAt = `${filing.filingDate}T00:00:00Z`;
    const ms = Date.parse(publishedAt);
    if (ms > cutoffMs) continue;

    candidates.push({
      ms,
      item: {
        id: `edgar-${filing.accessionNumber}`,
        title: `${filing.form} filed ${filing.filingDate} (${filing.primaryDocument})`,
        published_at: publishedAt,
        url: edgarDocumentUrl(cik, filing.accessionNumber, filing.primaryDocument),
        source: `edgar:${filing.form}`,
      },
    });
  }

  candidates.sort((a, b) => b.ms - a.ms);
  return candidates.map((candidate) => candidate.item);
}

export function assertNoLeak(items: BenchNewsItem[], cutoffIso: string): void {
  const cutoffMs = Date.parse(cutoffIso);
  for (const item of items) {
    if (Date.parse(item.published_at) > cutoffMs) {
      throw new Error(`news item leaks post-cutoff timestamp: ${item.id} published_at=${item.published_at}`);
    }
  }
}
