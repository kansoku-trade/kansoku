import type { Scores } from '../schema/scores.js';
import { loadBenchReportUiAssets } from './uiAssets.js';
import { escapeHtml, serializeForScript } from './htmlFormat.js';
import type { ReportConfigSnapshot } from './render.js';
import { buildLeaderboardReportViewData } from './viewModel.js';

export interface RenderHtmlOptions {
  now?: () => Date;
}

export interface RenderHtmlResult {
  html: string;
}

export function renderReportHtml(
  scores: Scores,
  config: ReportConfigSnapshot,
  options: RenderHtmlOptions = {},
): RenderHtmlResult {
  const now = options.now ?? (() => new Date());
  const generatedAt = now().toISOString();
  const runId = config.runId ?? scores.runId;

  const viewData = buildLeaderboardReportViewData(scores, config, generatedAt);
  const assets = loadBenchReportUiAssets('leaderboard');

  const html = `<!doctype html>
<html lang="zh"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="color-scheme" content="dark"/>
<title>Kansoku Trading Benchmark · ${escapeHtml(runId)}</title>
<style>${assets.css}</style>
</head><body><div id="root"></div>
<script>window.__KANSOKU_REPORT_DATA__=${serializeForScript(viewData)};</script>
<script>${assets.js}</script>
</body></html>
`;
  return { html };
}
