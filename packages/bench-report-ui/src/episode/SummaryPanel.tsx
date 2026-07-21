import type { EpisodeReportViewData } from '../types';

export function SummaryPanel({ data }: { data: EpisodeReportViewData }) {
  return (
    <section className="panel summary">
      <div className="panel-title">
        <h2>运行总览</h2>
        <span>{data.summarySubtitle}</span>
      </div>
      <div className="metrics">
        {data.metrics.map((cell) => (
          <div className={`metric ${cell.tone}`} key={cell.label}>
            <span>{cell.label}</span>
            <strong>{cell.value}</strong>
            <small>{cell.note}</small>
          </div>
        ))}
      </div>
      <div className="config-strip">
        {data.configStrip.map((item) => (
          <div key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}