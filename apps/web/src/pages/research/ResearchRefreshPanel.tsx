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
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  ResearchEvidenceItem,
  ResearchFinding,
  ResearchRefreshPhase,
  ResearchRefreshReport,
  ResearchRefreshTask,
} from "@kansoku/core/contract/index";
import { MarketTime, Spinner } from "@web/ui";

const PHASES: { phase: ResearchRefreshPhase; label: string }[] = [
  { phase: "preparing", label: "制定计划" },
  { phase: "documents", label: "核查文档" },
  { phase: "market", label: "检查市场" },
  { phase: "synthesis", label: "综合证据" },
  { phase: "proposal", label: "生成提案" },
];

const CONFIDENCE_LABEL: Record<ResearchFinding["confidence"], string> = {
  high: "高置信度",
  medium: "中等置信度",
  low: "低置信度",
};

function TaskProgress({ task }: { task: ResearchRefreshTask }) {
  const currentIndex = task.phase === "completed" ? PHASES.length : PHASES.findIndex((item) => item.phase === task.phase);
  return (
    <div className="research-refresh-progress" aria-label="研究任务进度">
      <div className="research-refresh-steps">
        {PHASES.map((item, index) => {
          const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "pending";
          return (
            <div className={`research-refresh-step research-refresh-step--${state}`} key={item.phase}>
              <span>{state === "complete" ? <Check size={10} /> : index + 1}</span>
              <small>{item.label}</small>
            </div>
          );
        })}
      </div>
      <p aria-live="polite"><Spinner /> {task.activity}</p>
      <small>开始于 <MarketTime value={task.startedAt} /></small>
    </div>
  );
}

function evidenceIcon(kind: ResearchEvidenceItem["kind"]) {
  if (kind === "market") return <Database size={13} />;
  if (kind === "news") return <Newspaper size={13} />;
  return <FileSearch size={13} />;
}

function FindingList({ findings, evidence }: {
  findings: ResearchFinding[];
  evidence: Map<string, ResearchEvidenceItem>;
}) {
  return (
    <div className="research-refresh-findings">
      {findings.map((finding, index) => (
        <article key={`${finding.title}:${index}`}>
          <header>
            <strong>{finding.title}</strong>
            <span className={`research-refresh-confidence research-refresh-confidence--${finding.confidence}`}>
              {CONFIDENCE_LABEL[finding.confidence]}
            </span>
          </header>
          <p>{finding.assessment}</p>
          <div className="research-refresh-citations" aria-label="引用证据">
            {finding.evidenceIds.map((id) => <code key={id} title={evidence.get(id)?.title}>{id}</code>)}
          </div>
        </article>
      ))}
    </div>
  );
}

function EvidenceList({ evidence }: { evidence: ResearchEvidenceItem[] }) {
  return (
    <div className="research-refresh-evidence">
      {evidence.map((item) => (
        <article key={item.id}>
          <span className="research-refresh-evidence-icon">{evidenceIcon(item.kind)}</span>
          <div>
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
            <footer>
              <code>{item.id}</code>
              <MarketTime value={item.asOf} />
              {item.kind === "news" && /^https?:\/\//.test(item.locator) ? (
                <a href={item.locator} target="_blank" rel="noreferrer">
                  来源 <ExternalLink size={11} />
                </a>
              ) : <code>{item.locator}</code>}
            </footer>
          </div>
        </article>
      ))}
    </div>
  );
}

function ReportSection({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <details className="research-refresh-details">
      <summary>
        <ChevronRight size={13} />
        <span>{title}</span>
        <b>{count}</b>
      </summary>
      <div>{children}</div>
    </details>
  );
}

function ResearchReport({ task, report }: { task: ResearchRefreshTask; report: ResearchRefreshReport }) {
  const evidence = new Map(report.evidence.map((item) => [item.id, item]));
  return (
    <div className="research-refresh-report">
      <div className="research-refresh-summary">
        <span><BrainCircuit size={14} /> 研究报告 · <MarketTime value={task.startedAt} /></span>
        <p>{report.summary}</p>
        <small className="research-refresh-stats">
          {report.findings.length} 条结论 · {report.risks.length} 条风险 · {report.evidence.length} 个证据源
        </small>
      </div>
      {report.proposalId ? (
        <div className="research-refresh-proposal"><FileDiff size={14} /> 已生成修改提案，请在下方逐项审阅。</div>
      ) : null}
      <ReportSection title="主要结论" count={report.findings.length}>
        <FindingList findings={report.findings} evidence={evidence} />
      </ReportSection>
      <ReportSection title="风险与反证" count={report.risks.length}>
        <FindingList findings={report.risks} evidence={evidence} />
      </ReportSection>
      <ReportSection title="待验证问题" count={report.openQuestions.length}>
        <ul className="research-refresh-questions">
          {report.openQuestions.map((question, index) => <li key={`${question}:${index}`}>{question}</li>)}
        </ul>
      </ReportSection>
      <ReportSection title="证据来源" count={report.evidence.length}>
        <EvidenceList evidence={report.evidence} />
      </ReportSection>
    </div>
  );
}

export function ResearchRefreshCard({ task }: { task: ResearchRefreshTask }) {
  if (task.status === "running") {
    return (
      <div className="research-refresh-card">
        <TaskProgress task={task} />
      </div>
    );
  }
  if (task.status === "completed" && task.report) {
    return (
      <div className="research-refresh-card">
        <ResearchReport task={task} report={task.report} />
      </div>
    );
  }
  if (task.status === "failed" || task.status === "aborted") {
    return (
      <div className="research-refresh-card">
        <div className={`research-refresh-terminal research-refresh-terminal--${task.status}`}>
          <CircleAlert size={14} />
          <div>
            <strong>{task.status === "aborted" ? "任务已停止" : "研究任务失败"}</strong>
            <p>{task.error ?? task.activity}</p>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
