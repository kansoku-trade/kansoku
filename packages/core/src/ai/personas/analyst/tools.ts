import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Check } from 'typebox/value';
import {
  type CockpitComment,
  type CommentLevel,
  type IntradayPrediction,
  type NewsItem,
  type RawBar,
} from '@kansoku/shared/types';
import type { ReassessPhase } from '../../../contract/symbols.js';
import { chartUrl } from '../../../platform/chartUrl.js';
import { buildChart } from '../../../charts/build.js';
import { validatePrediction } from '../../../analysis/predictionRules.js';
import type { SkillMeta } from '../../agents/skills.js';
import { createChart } from '../../../charts/store.js';
import type { ExecFn } from '../../agents/agentTools/execTool.js';
import type { FsReadMount } from '../../agents/agentTools/fsMounts.js';
import { buildResearchTools } from '../../agents/agentTools/researchTools.js';
import { buildDataPackTool, buildKlineTool, buildNewsTool, textResult } from '../../agents/dataTools.js';
import type { ReassessPack } from '../../agents/datapack.js';
import { DISCIPLINE_SKILL } from '../../runtime/promptPolicy.js';
import type { AnalystSkillContext } from '../../conversation/messages/analystMessagesEngine.js';
import {
  commentSchema,
  journalSchema,
  predictionSchema,
  submitSectionSchema,
  validateSubmitSection,
  type PredictionParams,
  type SubmitSectionParams,
} from './schemas.js';
import { setAnalystSection } from './runState.js';
import type { AnalystDeps, CreateChart } from './types.js';

export const SKILL_NAME = 'intraday-signal';

export function usSessionDate(epochMs: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(
    new Date(epochMs),
  );
}

export function buildJournalTool(
  symbol: string,
  journalDir: string,
  now: () => number,
  onWritten?: () => void,
): AgentTool<typeof journalSchema> {
  const base = symbol.split('.')[0].toUpperCase();
  return {
    name: 'write_journal',
    label: 'Write Journal',
    description: `Write journal/YYYY-MM-DD-${base}-intraday.md according to Skill Step 7 and the US Eastern trading date. Append a section when the same-day file exists; never overwrite it. Provide Markdown content only.`,
    parameters: journalSchema,
    execute: async (_id, params) => {
      const content = params.content;
      if (!content.trim()) return textResult('rejected: content is empty');
      const file = `${usSessionDate(now())}-${base}-intraday.md`;
      const path = join(journalDir, file);
      await fs.mkdir(journalDir, { recursive: true });
      const existing = await fs.readFile(path, 'utf8').catch(() => null);
      const next =
        existing == null ? content : `${existing.replace(/\n*$/, '')}\n\n---\n\n${content}`;
      await fs.writeFile(path, next, 'utf8');
      onWritten?.();
      return textResult(`written to journal/${file}${existing == null ? '' : ' (appended)'}`);
    },
  };
}

export async function defaultCreateChart(
  body: Record<string, unknown>,
): Promise<{ id: string; url: string }> {
  const result = await buildChart(body);
  const doc = await createChart(result);
  return { id: doc.id, url: chartUrl(doc) };
}

export interface RunState {
  chartId: string | null;
  journalWritten: boolean;
  loadedSkillIds: Set<string>;
  submitted: boolean;
}

export function buildAnalystSkillContexts(
  skillIndex: SkillMeta[],
  skillText: string,
  disciplineText: string,
): AnalystSkillContext[] {
  const activated = new Map<string, { content: string; fallbackDescription: string }>([
    [
      DISCIPLINE_SKILL,
      {
        content: disciplineText,
        fallbackDescription: 'Shared discipline and data boundaries for every trading judgment.',
      },
    ],
    [
      SKILL_NAME,
      {
        content: skillText,
        fallbackDescription: 'Multi-period direction, scenarios, and trade-plan analysis for one symbol across intraday to several trading days.',
      },
    ],
  ]);
  const skills: AnalystSkillContext[] = skillIndex.map((skill) => ({
    activated: activated.has(skill.name),
    content: activated.get(skill.name)?.content,
    description: skill.description,
    location: join(skill.dir, 'SKILL.md'),
    name: skill.name,
  }));
  const known = new Set(skills.map((skill) => skill.name));
  for (const [name, entry] of activated) {
    if (known.has(name)) continue;
    skills.push({
      activated: true,
      content: entry.content,
      description: entry.fallbackDescription,
      name,
    });
  }
  const priority = (name: string) => (name === DISCIPLINE_SKILL ? 0 : name === SKILL_NAME ? 1 : 2);
  return skills.sort((a, b) => priority(a.name) - priority(b.name) || a.name.localeCompare(b.name));
}

export interface SubmitPredictionHooks {
  createChart: CreateChart;
  appendComment: (comment: CockpitComment) => Promise<void>;
  isDone: () => boolean;
  reportProgress?: (phase: ReassessPhase, activity: string) => void;
  onSubmitted?: (chartId: string, params: PredictionParams) => void;
}

export function buildSubmitPredictionTool(
  symbol: string,
  hooks: SubmitPredictionHooks,
): AgentTool<typeof predictionSchema> {
  return {
    name: 'submit_prediction',
    label: 'Submit Prediction',
    description: 'Submit the complete conclusion and create the chart. Call exactly once after research is complete.',
    parameters: predictionSchema,
    execute: async (_id, params: PredictionParams) => {
      if (hooks.isDone()) return textResult('skipped', true);
      if (!Check(predictionSchema, params)) {
        return textResult(
          'prediction has an invalid structure. Add direction and scenarios; long and short also require entry_plan. Then retry.',
        );
      }
      const issues = validatePrediction(params as unknown as IntradayPrediction);
      if (issues.length) {
        return textResult(
          `prediction failed validation: ${issues.join('; ')}. Correct it and call submit_prediction again.`,
        );
      }
      const { comment, ...prediction } = params;
      hooks.reportProgress?.('finalizing', '正在生成图表并提交最终结论');
      const chart = await hooks.createChart({
        type: 'intraday',
        symbol,
        session: 'all',
        origin: 'analyst',
        prediction,
      });
      hooks.onSubmitted?.(chart.id, params);
      await hooks.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: 'info',
        text: comment,
        source: 'analyst',
        chartId: chart.id,
      });
      return textResult(JSON.stringify({ chartId: chart.id, url: chart.url }), true);
    },
  };
}

export interface SubmitSectionHooks {
  now: () => number;
}

export function buildSubmitSectionTool(
  symbol: string,
  hooks: SubmitSectionHooks,
): AgentTool<typeof submitSectionSchema> {
  return {
    name: 'submit_section',
    label: 'Submit Section',
    description: 'Submit an intermediate section for this run: technical after reading the data pack, context after covering news/flows. Keep it short. submit_prediction supersedes both at the end.',
    parameters: submitSectionSchema,
    execute: async (_id, params: SubmitSectionParams) => {
      if (!Check(submitSectionSchema, params)) {
        return textResult(
          'section has an invalid structure. kind must be technical (trends/levels/summary) or context (summary/bias). Correct it and retry.',
        );
      }
      const issues = validateSubmitSection(params);
      if (issues.length) {
        return textResult(
          `section rejected: ${issues.join('; ')}. Correct it and call submit_section again.`,
        );
      }
      setAnalystSection(
        symbol,
        params.kind === 'technical'
          ? {
              kind: 'technical',
              data: { trends: params.trends ?? [], levels: params.levels ?? [], summary: params.summary },
            }
          : { kind: 'context', data: { summary: params.summary, bias: params.bias ?? 'neutral' } },
        hooks.now,
      );
      return textResult(`${params.kind} section recorded`);
    },
  };
}

export function buildTools(
  symbol: string,
  deps: Required<Pick<AnalystDeps, 'createChart' | 'appendComment'>> & {
    buildReassessPack: (symbol: string) => Promise<ReassessPack>;
    fetchNews: (symbol: string) => Promise<NewsItem[]>;
    fetchKline: (symbol: string, period: string, count: number) => Promise<RawBar[]>;
    repoRoot: string;
    journalDir: string;
    exec: ExecFn;
    now: () => number;
    skillIndex: SkillMeta[];
    readMounts: FsReadMount[];
  },
  state: RunState,
  isDone: () => boolean,
  reportProgress: (phase: ReassessPhase, activity: string) => void,
): AgentTool[] {
  const readDataPack = buildDataPackTool(symbol, {
    buildPack: (symbol) => {
      reportProgress('researching', '正在整理多周期行情、资金流与持仓');
      return deps.buildReassessPack(symbol);
    },
    onPack: (pack) => {
      if (pack.prediction_chart_id && state.chartId == null)
        state.chartId = pack.prediction_chart_id;
    },
  });

  const fetchNewsTool = buildNewsTool(symbol, (symbol) => {
    reportProgress('researching', '正在核对最新消息与催化事件');
    return deps.fetchNews(symbol);
  });
  const fetchKlineTool = buildKlineTool(symbol, (symbol, period, count) => {
    reportProgress('researching', `正在补拉 ${period} K 线`);
    return deps.fetchKline(symbol, period, count);
  });

  const appendCommentTool: AgentTool<typeof commentSchema> = {
    name: 'append_comment',
    label: 'Append Comment',
    description: 'Write one plain-language observation as an analyst comment.',
    parameters: commentSchema,
    execute: async (_id, params) => {
      if (isDone()) return textResult('skipped');
      reportProgress('researching', '正在记录阶段性判断');
      await deps.appendComment({
        ts: new Date().toISOString(),
        symbol,
        level: params.level as CommentLevel,
        text: params.text,
        source: 'analyst',
        ...(state.chartId ? { chartId: state.chartId } : {}),
      });
      return textResult('recorded');
    },
  };

  const submitPrediction = buildSubmitPredictionTool(symbol, {
    createChart: deps.createChart,
    appendComment: deps.appendComment,
    isDone,
    reportProgress,
    onSubmitted: (chartId) => {
      state.chartId = chartId;
      state.submitted = true;
    },
  });

  const submitSection = buildSubmitSectionTool(symbol, { now: deps.now });

  const researchTools = buildResearchTools({
    repoRoot: deps.repoRoot,
    exec: (command) => {
      reportProgress('researching', '正在补充外部资料与风险信息');
      return deps.exec(command);
    },
    skillIndex: deps.skillIndex,
    onSkillRead: (name) => state.loadedSkillIds.add(name),
    readMounts: deps.readMounts,
  }).tools;

  return [
    readDataPack,
    fetchNewsTool,
    fetchKlineTool,
    appendCommentTool,
    submitPrediction,
    submitSection,
    ...researchTools,
    buildJournalTool(symbol, deps.journalDir, deps.now, () => {
      state.journalWritten = true;
      reportProgress('writing', '正在写入本次复盘日志');
    }),
  ];
}
