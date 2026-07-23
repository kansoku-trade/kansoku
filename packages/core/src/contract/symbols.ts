import type {
  BenchmarkSeries,
  ChartDoc,
  CockpitComment,
  CockpitFlow,
  CockpitPosition,
  RelativeVolume,
  SymbolAnalysisRow,
} from '@kansoku/shared/types';
import type {
  DeepDiveStartResult,
  DeepDiveState,
  ReassessResult,
  ReassessStatus,
} from '@kansoku/pro-api';
import { defineRoutes } from './defineRoutes.js';

export type {
  AnalystActivity,
  AnalystSections,
  ContextSection,
  DeepDiveStartResult,
  ReassessPhase,
  ReassessResult,
  ReassessStatus,
  TechnicalSection,
  TechnicalSectionLevel,
  TechnicalSectionTrend,
} from '@kansoku/pro-api';

export interface JournalListRow {
  name: string;
  date: string;
}

export interface JournalEntry {
  name: string;
  markdown: string;
  mtime: string;
}

export interface NoteResult {
  markdown: string | null;
  mtime?: string;
}

export interface SymbolFollowStatus {
  symbol: string;
  following: boolean;
  startedAt: string | null;
}

export interface LatestChart extends ChartDoc {
  url: string;
  prediction_stale: boolean;
}

export interface SymbolsApi {
  flow(input: { sym: string }): Promise<CockpitFlow | null>;
  benchmark(input: { sym: string }): Promise<BenchmarkSeries[]>;
  position(input: { sym: string }): Promise<CockpitPosition | null>;
  analyses(input: { sym: string }): Promise<SymbolAnalysisRow[]>;
  relvol(input: { sym: string }): Promise<RelativeVolume | null>;
  comments(input: { sym: string; date?: string }): Promise<CockpitComment[]>;
  commentDates(input: { sym: string }): Promise<string[]>;
  followStatus(input: { sym: string }): Promise<SymbolFollowStatus>;
  startFollow(input: { sym: string }): Promise<SymbolFollowStatus>;
  stopFollow(input: { sym: string }): Promise<SymbolFollowStatus>;
  journal(input: { sym: string }): Promise<JournalListRow[]>;
  journalEntry(input: { sym: string; name: string }): Promise<JournalEntry>;
  reassess(input: { sym: string }): Promise<ReassessResult>;
  reassessStatus(input: { sym: string }): Promise<ReassessStatus>;
  note(input: { sym: string }): Promise<NoteResult>;
  deepDive(input: { sym: string }): Promise<DeepDiveStartResult>;
  deepDiveStatus(input: { sym: string }): Promise<DeepDiveState>;
  latest(input: { sym: string }): Promise<LatestChart>;
}

export const symbolsRoutes = defineRoutes<SymbolsApi>('symbols', {
  flow: { method: 'GET', path: '/:sym/flow' },
  benchmark: { method: 'GET', path: '/:sym/benchmark' },
  position: { method: 'GET', path: '/:sym/position' },
  analyses: { method: 'GET', path: '/:sym/analyses' },
  relvol: { method: 'GET', path: '/:sym/relvol' },
  comments: { method: 'GET', path: '/:sym/comments' },
  commentDates: { method: 'GET', path: '/:sym/comment-dates' },
  followStatus: { method: 'GET', path: '/:sym/follow' },
  startFollow: { method: 'POST', path: '/:sym/follow', feature: 'symbol-follow' },
  stopFollow: { method: 'DELETE', path: '/:sym/follow' },
  journal: { method: 'GET', path: '/:sym/journal' },
  journalEntry: { method: 'GET', path: '/:sym/journal/:name' },
  reassess: { method: 'POST', path: '/:sym/reassess' },
  reassessStatus: { method: 'GET', path: '/:sym/reassess/status' },
  note: { method: 'GET', path: '/:sym/note', raw: 'body' },
  deepDive: { method: 'POST', path: '/:sym/deep-dive', raw: 'body', feature: 'deep-dive' },
  deepDiveStatus: {
    method: 'GET',
    path: '/:sym/deep-dive/status',
    raw: 'body',
    feature: 'deep-dive',
  },
  latest: { method: 'GET', path: '/:sym/latest' },
});
