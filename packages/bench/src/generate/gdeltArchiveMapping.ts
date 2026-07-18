import type { BenchNewsItem } from "../schema/newsItem.js";
import { hashSlug, normalizeTitle } from "./newsMapping.js";

const COL_DATE = 1;
const COL_DOMAIN = 3;
const COL_URL = 4;
const COL_ORGANIZATIONS = 11;
const COL_TRANSLATION_INFO = 25;
const MIN_COLUMNS = COL_TRANSLATION_INFO + 1;
const ARCHIVE_MAX_ITEMS = 10;

export interface GkgRow {
  date: string;
  domain: string;
  url: string;
  organizations: string;
  translationInfo: string;
}

export interface ArchiveMatch {
  date: string;
  url: string;
  domain: string;
}

export interface ArchiveTerms {
  strongTerms: string[];
  weakTerm: string;
  bankOrAssetManagerBrand?: boolean;
}

export interface ArchiveWindowRequest {
  symbol: string;
  terms: ArchiveTerms;
}

const FINANCE_CONTEXT_TERMS = [
  "stock",
  "stocks",
  "shares",
  "earnings",
  "nasdaq",
  "nyse",
  "investor",
  "dividend",
  "analyst",
  "price target",
];

const OTHER_EXCHANGE_TICKER_PATTERN = /(?:nyse|nasdaq)\s*:?\s*([a-z]{1,5})\b/g;

const ANALYST_ACTION_PATTERN =
  /(price target|pt (?:lowered|raised)|rating|upgrad|downgrad|initiates coverage|forecasts|reiterat|overweight|underweight)/;

const FUND_PRODUCT_PATTERN = /\b(?:etf|fund|inv(?:estment)?\s+trust|income trust|growth income trust)\b/;

const CORPORATE_SUFFIXES = ["inc", "inc.", "corp", "co", "co.", "plc"];

export function parseGkgRow(line: string): GkgRow | null {
  if (!line) return null;
  const cols = line.split("\t");
  if (cols.length < MIN_COLUMNS) return null;
  return {
    date: cols[COL_DATE],
    domain: cols[COL_DOMAIN],
    url: cols[COL_URL],
    organizations: cols[COL_ORGANIZATIONS],
    translationInfo: cols[COL_TRANSLATION_INFO],
  };
}

export function isEnglishRow(row: GkgRow): boolean {
  return row.translationInfo.trim() === "";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesTerm(haystack: string, term: string): boolean {
  if (!haystack) return false;
  const pattern = new RegExp(`\\b${escapeRegExp(term.toLowerCase())}\\b`);
  return pattern.test(haystack.toLowerCase());
}

function normalizeForMatch(value: string): string {
  return value.replace(/[-_]+/g, " ");
}

function tickerToken(symbol: string): string {
  return symbol.split(".")[0];
}

function hasFinanceCorroborator(url: string, organizations: string, derivedTitle: string | null, symbol: string): boolean {
  const ticker = tickerToken(symbol);
  const haystacks = [normalizeForMatch(url), normalizeForMatch(organizations), derivedTitle ?? ""];

  for (const haystack of haystacks) {
    if (matchesTerm(haystack, ticker)) return true;
    if (FINANCE_CONTEXT_TERMS.some((term) => matchesTerm(haystack, term))) return true;
  }
  return false;
}

function extractOtherExchangeTickers(text: string): string[] {
  const tickers: string[] = [];
  for (const match of text.toLowerCase().matchAll(OTHER_EXCHANGE_TICKER_PATTERN)) {
    tickers.push(match[1]);
  }
  return tickers;
}

function hasOtherTickerWithoutOwnTicker(text: string, ownTicker: string): boolean {
  const tickers = extractOtherExchangeTickers(text);
  const hasForeignTicker = tickers.some((ticker) => ticker !== ownTicker);
  if (!hasForeignTicker) return false;
  return !matchesTerm(text, ownTicker);
}

function orgTagEqualsStrongTerm(orgTag: string, term: string): boolean {
  const tag = normalizeForMatch(orgTag.trim().toLowerCase());
  const normalizedTerm = term.trim().toLowerCase();
  if (tag === normalizedTerm) return true;
  return CORPORATE_SUFFIXES.some((suffix) => tag === `${normalizedTerm} ${suffix}`);
}

function strongTermHasExactOrgTag(organizations: string, strongTerms: string[]): boolean {
  const orgTags = organizations
    .split(";")
    .map((tag) => tag.trim())
    .filter(Boolean);
  return orgTags.some((tag) => strongTerms.some((term) => orgTagEqualsStrongTerm(tag, term)));
}

export function rowMatchesCompany(row: GkgRow, terms: ArchiveTerms, symbol: string): boolean {
  const normalizedUrl = normalizeForMatch(row.url);
  const normalizedOrgs = normalizeForMatch(row.organizations);
  const derivedTitle = deriveTitleFromUrl(row.url);
  const normalizedTitle = normalizeForMatch((derivedTitle ?? "").toLowerCase());
  const titleAndUrl = `${normalizedTitle} ${normalizedUrl}`;
  const ownTicker = tickerToken(symbol).toLowerCase();

  if (hasOtherTickerWithoutOwnTicker(titleAndUrl, ownTicker)) return false;

  if (terms.bankOrAssetManagerBrand) {
    const ownTickerPresent = matchesTerm(titleAndUrl, ownTicker);
    if (ANALYST_ACTION_PATTERN.test(titleAndUrl) && !ownTickerPresent) return false;
    if (FUND_PRODUCT_PATTERN.test(titleAndUrl) && !ownTickerPresent) return false;
  }

  const strongTermInTitleOrUrl = terms.strongTerms.some(
    (term) => matchesTerm(normalizedUrl, term) || matchesTerm(normalizedTitle, term),
  );
  if (strongTermInTitleOrUrl) return true;

  const strongTermInOrgsOnly = terms.strongTerms.some((term) => matchesTerm(normalizedOrgs, term));
  if (strongTermInOrgsOnly && strongTermHasExactOrgTag(row.organizations, terms.strongTerms)) {
    return true;
  }

  const weakHit = matchesTerm(normalizedOrgs, terms.weakTerm) || matchesTerm(normalizedUrl, terms.weakTerm);
  if (!weakHit) return false;

  return hasFinanceCorroborator(row.url, row.organizations, derivedTitle, symbol);
}

export function extractArchiveMatches(csv: string, requests: ArchiveWindowRequest[]): Map<string, ArchiveMatch[]> {
  const bySymbol = new Map<string, ArchiveMatch[]>();
  for (const request of requests) bySymbol.set(request.symbol, []);

  for (const line of csv.split("\n")) {
    if (!line) continue;
    const row = parseGkgRow(line);
    if (!row) continue;
    if (!isEnglishRow(row)) continue;

    for (const request of requests) {
      if (rowMatchesCompany(row, request.terms, request.symbol)) {
        bySymbol.get(request.symbol)!.push({ date: row.date, url: row.url, domain: row.domain });
      }
    }
  }
  return bySymbol;
}

function stripKnownExtension(segment: string): string {
  return segment.replace(/\.(html?|php|aspx?)$/i, "");
}

function stripUnknownTrailingExtension(segment: string): string {
  const match = /^(.+)\.([a-zA-Z0-9]{1,5})$/.exec(segment);
  return match ? match[1] : segment;
}

function stripTrailingExtension(segment: string): string {
  const knownStripped = stripKnownExtension(segment);
  if (knownStripped !== segment) return knownStripped;
  return stripUnknownTrailingExtension(segment);
}

function alphaCount(word: string): number {
  return (word.match(/[a-zA-Z]/g) ?? []).length;
}

function hasUsableSlug(words: string[]): boolean {
  return words.filter((word) => alphaCount(word) >= 3).length >= 2;
}

function slugToTitle(segment: string): string | null {
  const stripped = stripTrailingExtension(segment);
  let cleaned = stripped.replace(/[-_]+/g, " ").trim();
  cleaned = cleaned.replace(/\s+\d+$/, "").trim();
  if (!cleaned) return null;

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return null;
  if (!hasUsableSlug(words)) return null;

  return words.map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(" ");
}

export function deriveTitleFromUrl(url: string): string | null {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return null;
  }

  const segments = pathname.split("/").filter(Boolean);
  for (let i = segments.length - 1; i >= 0; i--) {
    const title = slugToTitle(segments[i]);
    if (title) return title;
  }
  return null;
}

export function gkgDateToIso(date: string): string {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(date);
  if (!match) throw new Error(`unrecognized GKG DATE: ${date}`);
  const [, year, month, day, hour, minute, second] = match;
  return `${year}-${month}-${day}T${hour}:${minute}:${second}Z`;
}

export function mapArchiveMatches(matches: ArchiveMatch[], cutoffIso: string): BenchNewsItem[] {
  const cutoffMs = Date.parse(cutoffIso);
  const seenTitles = new Set<string>();
  const candidates: { item: BenchNewsItem; ms: number }[] = [];

  for (const match of matches) {
    const publishedAt = gkgDateToIso(match.date);
    const ms = Date.parse(publishedAt);
    if (ms > cutoffMs) continue;

    const title = deriveTitleFromUrl(match.url);
    if (!title) continue;

    const normalized = normalizeTitle(title);
    if (seenTitles.has(normalized)) continue;
    seenTitles.add(normalized);

    candidates.push({
      ms,
      item: {
        id: `gdelt-arch-${hashSlug(match.url)}`,
        title,
        published_at: publishedAt,
        url: match.url,
        source: `gdelt-arch:${match.domain}`,
      },
    });
  }

  candidates.sort((a, b) => b.ms - a.ms);
  return candidates.slice(0, ARCHIVE_MAX_ITEMS).map((candidate) => candidate.item);
}
