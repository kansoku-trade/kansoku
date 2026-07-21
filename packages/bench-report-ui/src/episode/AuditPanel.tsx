import type { EpisodeReportViewData } from '../types';
import { Disclosure } from '../ui/Disclosure';

export function AuditPanel({ audit }: { audit: EpisodeReportViewData['audit'] }) {
  if (!audit.attached) {
    return (
      <section className="panel audit-panel">
        <Disclosure
          summary={
            <>
              <span>长桥数据审计</span>
              <strong>未附加</strong>
            </>
          }
        >
          <p className="process-empty">该运行没有附加数据审计结果。</p>
        </Disclosure>
      </section>
    );
  }
  const allPass = audit.passed === audit.total;
  return (
    <section className="panel audit-panel">
      <Disclosure
        defaultOpen={!allPass}
        summary={
          <>
            <span>
              长桥数据审计 <small>逐字段校验 K 线、cutoff、时区与未来数据边界</small>
            </span>
            <strong className={allPass ? 'positive' : 'negative'}>
              {audit.passed}/{audit.total} 通过
            </strong>
          </>
        }
      >
        <div className="audit-grid">
          {audit.checks.map((check) => (
            <div
              className={`audit-check ${check.status}`}
              key={`${check.questionId}-${check.checkId}`}
            >
              <i>{check.status === 'pass' ? '✓' : '!'}</i>
              <span>
                <strong>{check.label}</strong>
                <small>
                  {check.questionId} · {check.checkId}
                </small>
                {check.detail ? <em>{check.detail}</em> : null}
              </span>
            </div>
          ))}
        </div>
      </Disclosure>
    </section>
  );
}
