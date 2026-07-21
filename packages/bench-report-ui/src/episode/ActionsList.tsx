import type { EpisodeReportActionRecordView } from '../types';
import { Disclosure, MoreText } from '../ui/Disclosure';

export function ActionsList({
  actions,
  activeStep,
  onToggle,
}: {
  actions: EpisodeReportActionRecordView[];
  activeStep: number | null;
  onToggle: (record: EpisodeReportActionRecordView) => void;
}) {
  return (
    <section className="actions">
      <Disclosure
        summary={
          <h4>
            回放动作与理由 <span>{actions.length}</span>
          </h4>
        }
      >
        {actions.length === 0 ? (
          <p className="ledger-hint">没有动作记录</p>
        ) : (
          <ol>
            {actions.map((record) => {
              const selectable = record.chartTimes != null;
              const active = activeStep === record.step;
              const head = (
                <>
                  <span className="ac-step">{String(record.step).padStart(2, '0')}</span>
                  <span className="ac-body">
                    <strong>
                      {record.actionLabel} · {record.reasonCategoryLabel ?? '未记录理由'}
                    </strong>
                    <em>{record.timeLabel}</em>
                  </span>
                </>
              );
              return (
                <li key={record.step}>
                  {selectable ? (
                    <button
                      type="button"
                      data-action-select=""
                      aria-pressed={active}
                      className={active ? 'ac-select active' : 'ac-select'}
                      onClick={() => onToggle(record)}
                    >
                      {head}
                    </button>
                  ) : (
                    <div className="ac-select">{head}</div>
                  )}
                  {record.reasonSummary ? (
                    <div className="ac-reason">
                      <MoreText text={record.reasonSummary} />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Disclosure>
    </section>
  );
}
