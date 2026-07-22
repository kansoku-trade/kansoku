import { type CockpitComment, type NewsItem, type RawBar } from '@kansoku/shared/types';
import type { ReassessStatus } from '../../../contract/symbols.js';
import type { AiAgentFactory } from '../../agents/agentSession.js';
import type { ExecFn } from '../../agents/agentTools/execTool.js';
import type { ReassessPack } from '../../agents/datapack.js';
import type { AiModel } from '../../runtime/models.js';

export type CreateChart = (body: Record<string, unknown>) => Promise<{ id: string; url: string }>;

export type AnalystOrigin = 'manual' | 'escalation';

export interface AnalystDeps {
  model: AiModel;
  agentFactory?: AiAgentFactory;
  buildReassessPack?: (symbol: string) => Promise<ReassessPack>;
  fetchNews?: (symbol: string) => Promise<NewsItem[]>;
  fetchKline?: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
  createChart?: CreateChart;
  appendComment?: (comment: CockpitComment) => Promise<void>;
  runAggregator?: (input: { symbol: string; chartId: string | null }) => void;
  appendHypothesisRunCard?: (id: string, card: Record<string, unknown>) => Promise<void>;
  timeoutMs?: number;
  now?: () => number;
  origin?: AnalystOrigin;
  repoRoot?: string;
  journalDir?: string;
  exec?: ExecFn;
  skillText?: string;
  disciplineText?: string;
}

export interface RunAnalystInput {
  symbol: string;
  origin: AnalystOrigin;
  deps: AnalystDeps;
}

export type StartResult =
  | { started: false; reason: 'already running' | 'escalation on cooldown' }
  | { started: true; done: Promise<void> };

export type RunningAnalystRunStatus = Extract<ReassessStatus, { running: true }>;
