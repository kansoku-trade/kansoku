import { toGdeltStamp } from "./newsWindow.js";
import type { EdgarFiling, GdeltArticle } from "./newsMapping.js";

export type FetchGdeltArticles = (companyQuery: string, startIso: string, endIso: string) => Promise<GdeltArticle[]>;
export type FetchEdgarFilings = (cik: string) => Promise<EdgarFiling[]>;

const SEC_USER_AGENT = "kansoku-bench i@innei.dev";
const GDELT_THROTTLE_MS = 30_000;
const GDELT_BACKOFF_MS = 60_000;
const GDELT_MAX_RETRIES = 3;
const GDELT_MAX_RECORDS = 20;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let lastGdeltRequestAt = 0;

async function throttleGdelt(): Promise<void> {
  const elapsed = Date.now() - lastGdeltRequestAt;
  if (elapsed < GDELT_THROTTLE_MS) await sleep(GDELT_THROTTLE_MS - elapsed);
  lastGdeltRequestAt = Date.now();
}

interface GdeltDocResponse {
  articles?: GdeltArticle[];
}

export const fetchGdeltArticlesLive: FetchGdeltArticles = async (companyQuery, startIso, endIso) => {
  const query = `${companyQuery} sourcelang:eng`;
  const params = new URLSearchParams({
    query,
    mode: "artlist",
    format: "json",
    startdatetime: toGdeltStamp(startIso),
    enddatetime: toGdeltStamp(endIso),
    maxrecords: String(GDELT_MAX_RECORDS),
  });
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?${params.toString()}`;

  for (let attempt = 0; attempt < GDELT_MAX_RETRIES; attempt++) {
    await throttleGdelt();
    try {
      const response = await fetch(url);
      const text = await response.text();
      if (response.status === 429) {
        await sleep(GDELT_BACKOFF_MS);
        continue;
      }
      const parsed = JSON.parse(text) as GdeltDocResponse;
      return parsed.articles ?? [];
    } catch {
      await sleep(GDELT_BACKOFF_MS);
    }
  }
  throw new Error(`GDELT rate-limited after ${GDELT_MAX_RETRIES} attempts: ${companyQuery}`);
};

interface SecSubmissionsResponse {
  filings?: {
    recent?: {
      form?: string[];
      filingDate?: string[];
      primaryDocument?: string[];
      accessionNumber?: string[];
    };
  };
}

export const fetchEdgarFilingsLive: FetchEdgarFilings = async (cik) => {
  const url = `https://data.sec.gov/submissions/CIK${cik}.json`;
  const response = await fetch(url, { headers: { "User-Agent": SEC_USER_AGENT } });
  if (!response.ok) throw new Error(`EDGAR submissions fetch failed for CIK${cik}: ${response.status}`);
  const parsed = (await response.json()) as SecSubmissionsResponse;
  const recent = parsed.filings?.recent;
  if (!recent) return [];

  const forms = recent.form ?? [];
  const filingDates = recent.filingDate ?? [];
  const primaryDocuments = recent.primaryDocument ?? [];
  const accessionNumbers = recent.accessionNumber ?? [];

  const filings: EdgarFiling[] = [];
  for (let i = 0; i < forms.length; i++) {
    filings.push({
      form: forms[i],
      filingDate: filingDates[i],
      primaryDocument: primaryDocuments[i],
      accessionNumber: accessionNumbers[i],
    });
  }
  return filings;
};
