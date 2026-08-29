import {
  BrainCircuit,
  Check,
  ChevronRight,
  CircleAlert,
  Database,
  ExternalLink,
  FileDiff,
  FileSearch,
  Newspaper,
} from 'lucide-react';
import { useState, type ReactNode } from 'react';
import type {
  ResearchEvidenceItem,
  ResearchFinding,
  ResearchRefreshPhase,
  ResearchRefreshReport,
  ResearchRefreshTask,
} from '@kansoku/core/contract/index';
import * as stylex from '@stylexjs/stylex';
import { MarketTime, Spinner } from '@web/ui';
import { colors, fonts, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const PHASES: { phase: ResearchRefreshPhase; label: string }[] = [
  { phase: 'preparing', label: '制定计划' },
  { phase: 'documents', label: '核查文档' },
  { phase: 'market', label: '检查市场' },
  { phase: 'synthesis', label: '研判' },
  { phase: 'proposal', label: '定稿' },
];

const CONFIDENCE_LABEL: Record<ResearchFinding['confidence'], string> = {
  high: '确认',
  medium: '待验证',
  low: '存疑',
};

const styles = stylex.create({
  card: {
    backgroundColor: `color-mix(in srgb, ${colors.backgroundElement} 72%, ${colors.backgroundSurface})`,
    borderRadius: radii.default,
    boxShadow: '0 0 0 1px rgb(255 255 255 / 0.075), 0 8px 24px rgb(0 0 0 / 0.12)',
    overflow: 'hidden',
  },
  progress: {
    padding: '12px',
  },
  steps: {
    display: 'grid',
    gap: '3px',
    gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  },
  step: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    minWidth: 0,
  },
  stepComplete: {
    color: colors.textSecondary,
  },
  stepCurrent: {
    color: colors.accent,
  },
  stepMarker: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.full,
    boxShadow: `0 0 0 1px ${colors.border}`,
    color: colors.textMuted,
    display: 'inline-flex',
    flex: '0 0 auto',
    fontFamily: fonts.mono,
    fontSize: '9px',
    fontVariantNumeric: 'tabular-nums',
    height: '16px',
    justifyContent: 'center',
    width: '16px',
  },
  stepMarkerComplete: {
    backgroundColor: 'rgba(255, 176, 0, 0.1)',
    boxShadow: '0 0 0 1px rgba(255, 176, 0, 0.28)',
    color: colors.accent,
  },
  stepMarkerCurrent: {
    backgroundColor: 'rgba(255, 176, 0, 0.14)',
    boxShadow: '0 0 0 1px rgba(255, 176, 0, 0.5)',
    color: colors.accent,
  },
  stepLabel: {
    fontSize: '9px',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressActivity: {
    alignItems: 'center',
    color: colors.textSecondary,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '7px',
    lineHeight: 1.45,
    margin: '13px 0 3px',
    textWrap: 'pretty',
  },
  progressStarted: {
    color: colors.textMuted,
    fontSize: '10px',
    fontVariantNumeric: 'tabular-nums',
  },
  report: {
    display: 'flex',
    flexDirection: 'column',
  },
  reportSection: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
    padding: '10px 12px',
  },
  reportFirstSection: {
    padding: '10px 12px',
  },
  summary: {
    display: 'flex',
    flexDirection: 'column',
  },
  summaryTitle: {
    alignItems: 'center',
    color: colors.accent,
    display: 'flex',
    fontSize: fontSizes.xs,
    fontWeight: 650,
    gap: '6px',
  },
  summaryText: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
    lineHeight: 1.55,
    margin: '7px 0 0',
    textWrap: 'pretty',
  },
  stats: {
    color: colors.textMuted,
    display: 'block',
    fontSize: fontSizes.xs,
    fontVariantNumeric: 'tabular-nums',
    marginTop: '8px',
  },
  proposal: {
    alignItems: 'center',
    color: colors.accent,
    display: 'flex',
    fontSize: fontSizes.xs,
    gap: '7px',
    lineHeight: 1.45,
    textWrap: 'pretty',
  },
  findings: {
    display: 'flex',
    flexDirection: 'column',
  },
  finding: {
    padding: '9px 0',
  },
  findingWithBorder: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  findingHeader: {
    alignItems: 'flex-start',
    display: 'flex',
    gap: '8px',
    justifyContent: 'space-between',
  },
  findingTitle: {
    color: colors.textPrimary,
    fontSize: fontSizes.sm,
    fontWeight: 600,
    lineHeight: 1.35,
    textWrap: 'balance',
  },
  findingAssessment: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 1.5,
    margin: '6px 0 8px',
    textWrap: 'pretty',
  },
  confidence: {
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.full,
    color: colors.textMuted,
    flex: '0 0 auto',
    fontSize: '9px',
    padding: '2px 5px',
    whiteSpace: 'nowrap',
  },
  confidenceHigh: {
    color: colors.up,
  },
  confidenceLow: {
    color: colors.down,
  },
  citations: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  citation: {
    backgroundColor: colors.backgroundSurface,
    borderRadius: `calc(${radii.default} - 1px)`,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: '9px',
    overflowWrap: 'anywhere',
    padding: '2px 4px',
  },
  questions: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
    lineHeight: 1.55,
    margin: 0,
    paddingLeft: '18px',
  },
  question: {
    textWrap: 'pretty',
  },
  detailsSummary: {
    'alignItems': 'center',
    'color': colors.textSecondary,
    'cursor': 'pointer',
    'display': 'flex',
    'fontSize': fontSizes.xs,
    'fontWeight': 600,
    'listStyle': 'none',
    'minHeight': sizes.controlHeight,
    '::-webkit-details-marker': {
      display: 'none',
    },
  },
  detailsIcon: {
    flex: '0 0 auto',
    marginRight: '5px',
    transitionDuration: '150ms',
    transitionProperty: 'transform',
    transitionTimingFunction: 'ease-out',
  },
  detailsIconOpen: {
    transform: 'rotate(90deg)',
  },
  detailsCount: {
    alignItems: 'center',
    backgroundColor: colors.backgroundSurface,
    borderRadius: radii.full,
    color: colors.textSecondary,
    display: 'inline-flex',
    fontSize: '9px',
    fontVariantNumeric: 'tabular-nums',
    height: '18px',
    justifyContent: 'center',
    marginLeft: 'auto',
    minWidth: '18px',
    paddingInline: '5px',
  },
  detailsContent: {
    paddingTop: '8px',
  },
  evidence: {
    display: 'grid',
    gap: '7px',
    gridTemplateColumns: '22px 1fr',
    padding: '8px 0',
  },
  evidenceWithBorder: {
    borderTopColor: colors.border,
    borderTopStyle: 'solid',
    borderTopWidth: '1px',
  },
  evidenceIcon: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'inline-flex',
    height: '22px',
    justifyContent: 'center',
    width: '22px',
  },
  evidenceBody: {
    minWidth: 0,
  },
  evidenceTitle: {
    color: colors.textSecondary,
    display: 'block',
    fontSize: fontSizes.xs,
    lineHeight: 1.4,
    textWrap: 'pretty',
  },
  evidenceSummary: {
    color: colors.textMuted,
    fontSize: '10px',
    lineHeight: 1.45,
    margin: '4px 0 6px',
    textWrap: 'pretty',
  },
  evidenceFooter: {
    alignItems: 'center',
    color: colors.textMuted,
    display: 'flex',
    flexWrap: 'wrap',
    fontSize: '9px',
    gap: '5px',
  },
  evidenceCode: {
    backgroundColor: colors.backgroundSurface,
    borderRadius: `calc(${radii.default} - 1px)`,
    color: colors.textMuted,
    fontFamily: fonts.mono,
    fontSize: '9px',
    overflowWrap: 'anywhere',
    padding: '2px 4px',
  },
  evidenceLink: {
    alignItems: 'center',
    color: colors.accent,
    display: 'inline-flex',
    gap: '3px',
    textDecoration: 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  terminal: {
    color: colors.textMuted,
    display: 'flex',
    gap: '8px',
    padding: '12px',
  },
  terminalIcon: {
    flex: '0 0 auto',
    marginTop: '1px',
  },
  terminalTitle: {
    color: colors.textSecondary,
    fontSize: fontSizes.xs,
  },
  terminalMessage: {
    fontSize: fontSizes.xs,
    lineHeight: 1.45,
    margin: '4px 0 0',
    textWrap: 'pretty',
  },
  terminalFailed: {
    color: colors.down,
  },
});

function TaskProgress({ task }: { task: ResearchRefreshTask }) {
  const currentIndex =
    task.phase === 'completed'
      ? PHASES.length
      : PHASES.findIndex((item) => item.phase === task.phase);
  return (
    <div {...stylex.props(styles.progress)} aria-label="研究任务进度">
      <div {...stylex.props(styles.steps)}>
        {PHASES.map((item, index) => {
          const state =
            index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'pending';
          return (
            <div
              {...stylex.props(
                styles.step,
                state === 'complete' && styles.stepComplete,
                state === 'current' && styles.stepCurrent,
              )}
              key={item.phase}
            >
              <span
                {...stylex.props(
                  styles.stepMarker,
                  state === 'complete' && styles.stepMarkerComplete,
                  state === 'current' && styles.stepMarkerCurrent,
                )}
              >
                {state === 'complete' ? <Check size={10} /> : index + 1}
              </span>
              <small {...stylex.props(styles.stepLabel)}>{item.label}</small>
            </div>
          );
        })}
      </div>
      <p {...stylex.props(styles.progressActivity)} aria-live="polite">
        <Spinner /> {task.activity}
      </p>
      <small {...stylex.props(styles.progressStarted)}>
        开始于 <MarketTime value={task.startedAt} />
      </small>
    </div>
  );
}

function evidenceIcon(kind: ResearchEvidenceItem['kind']) {
  if (kind === 'market') return <Database size={13} />;
  if (kind === 'news') return <Newspaper size={13} />;
  return <FileSearch size={13} />;
}

function FindingList({
  findings,
  evidence,
}: {
  findings: ResearchFinding[];
  evidence: Map<string, ResearchEvidenceItem>;
}) {
  return (
    <div {...stylex.props(styles.findings)}>
      {findings.map((finding, index) => (
        <article
          {...stylex.props(styles.finding, index > 0 && styles.findingWithBorder)}
          key={`${finding.title}:${index}`}
        >
          <header {...stylex.props(styles.findingHeader)}>
            <strong {...stylex.props(styles.findingTitle)}>{finding.title}</strong>
            <span
              {...stylex.props(
                styles.confidence,
                finding.confidence === 'high' && styles.confidenceHigh,
                finding.confidence === 'low' && styles.confidenceLow,
              )}
            >
              {CONFIDENCE_LABEL[finding.confidence]}
            </span>
          </header>
          <p {...stylex.props(styles.findingAssessment)}>{finding.assessment}</p>
          <div {...stylex.props(styles.citations)} aria-label="引用证据">
            {finding.evidenceIds.map((id) => (
              <code {...stylex.props(styles.citation)} key={id} title={evidence.get(id)?.title}>
                {id}
              </code>
            ))}
          </div>
        </article>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: ResearchEvidenceItem[] }) {
  return (
    <div>
      {evidence.map((item) => (
        <article
          {...stylex.props(styles.evidence, item !== evidence[0] && styles.evidenceWithBorder)}
          key={item.id}
        >
          <span {...stylex.props(styles.evidenceIcon)}>{evidenceIcon(item.kind)}</span>
          <div {...stylex.props(styles.evidenceBody)}>
            <strong {...stylex.props(styles.evidenceTitle)}>{item.title}</strong>
            <p {...stylex.props(styles.evidenceSummary)}>{item.summary}</p>
            <footer {...stylex.props(styles.evidenceFooter)}>
              <code {...stylex.props(styles.evidenceCode)}>{item.id}</code>
              <MarketTime value={item.asOf} />
              {item.kind === 'news' && /^https?:\/\//.test(item.locator) ? (
                <a
                  {...stylex.props(styles.evidenceLink)}
                  href={item.locator}
                  target="_blank"
                  rel="noreferrer"
                >
                  来源 <ExternalLink size={11} />
                </a>
              ) : (
                <code {...stylex.props(styles.evidenceCode)}>{item.locator}</code>
              )}
            </footer>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  if (count === 0) return null;
  return (
    <details
      {...stylex.props(styles.reportSection)}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary {...stylex.props(styles.detailsSummary)}>
        <ChevronRight
          size={13}
          {...stylex.props(styles.detailsIcon, open && styles.detailsIconOpen)}
        />
        <span>{title}</span>
        <b {...stylex.props(styles.detailsCount)}>{count}</b>
      </summary>
      <div {...stylex.props(styles.detailsContent)}>{children}</div>
    </details>
  );
}

function ResearchReport({
  task,
  report,
}: {
  task: ResearchRefreshTask;
  report: ResearchRefreshReport;
}) {
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <div {...stylex.props(styles.report)}>
      <div {...stylex.props(styles.reportFirstSection, styles.summary)}>
        <span {...stylex.props(styles.summaryTitle)}>
          <BrainCircuit size={14} /> 研究报告 · <MarketTime value={task.startedAt} />
        </span>
        <p {...stylex.props(styles.summaryText)}>{report.summary}</p>
        <small {...stylex.props(styles.stats)}>
          {report.findings.length} 条结论 · {report.risks.length} 条风险 · {report.evidence.length}{' '}
          个证据源
        </small>
      </div>
      {report.proposalId ? (
        <div {...stylex.props(styles.reportSection, styles.proposal)}>
          <FileDiff size={14} /> 已生成修改提案，请在下方逐项审阅。
        </div>
      ) : null}
      <ReportSection title="主要结论" count={report.findings.length}>
        <FindingList findings={report.findings} evidence={evidence} />
      </ReportSection>
      <ReportSection title="风险项" count={report.risks.length}>
        <FindingList findings={report.risks} evidence={evidence} />
      </ReportSection>
      <ReportSection title="待定项" count={report.openQuestions.length}>
        <ul {...stylex.props(styles.questions)}>
          {report.openQuestions.map((question, index) => (
            <li {...stylex.props(styles.question)} key={`${question}:${index}`}>
              {question}
            </li>
          ))}
        </ul>
      </ReportSection>
      <ReportSection title="数据源" count={report.evidence.length}>
        <EvidenceList evidence={report.evidence} />
      </ReportSection>
    </div>
  );
}

export function ResearchRefreshCard({ task }: { task: ResearchRefreshTask }) {
  if (task.status === 'running') {
    return (
      <div {...stylex.props(styles.card)}>
        <TaskProgress task={task} />
      </div>
    );
  }
  if (task.status === 'completed' && task.report) {
    return (
      <div {...stylex.props(styles.card)}>
        <ResearchReport task={task} report={task.report} />
      </div>
    );
  }
  if (task.status === 'failed' || task.status === 'aborted') {
    return (
      <div {...stylex.props(styles.card)}>
        <div {...stylex.props(styles.terminal, task.status === 'failed' && styles.terminalFailed)}>
          <CircleAlert size={14} {...stylex.props(styles.terminalIcon)} />
          <div>
            <strong {...stylex.props(styles.terminalTitle)}>
              {task.status === 'aborted' ? '任务已停止' : '研究任务失败'}
            </strong>
            <p {...stylex.props(styles.terminalMessage)}>{task.error ?? task.activity}</p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
