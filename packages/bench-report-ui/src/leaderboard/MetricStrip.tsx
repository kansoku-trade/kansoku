import type { LeaderboardReportViewData } from '../types';

export function MetricStrip({ data }: { data: LeaderboardReportViewData }) {
  return (
    <div className="mstrip">
      <h1>{data.title}</h1>
      <span className="sub">
        {data.subtitle.prefix}
        {data.subtitle.beatenLabel != null && (
          <>
            {' · '}
            <b>{data.subtitle.beatenLabel}</b>
            {' 判断分跑赢买入持有'}
          </>
        )}
      </span>
      <div className="kvs mono">
        {data.kvs.map((kv) => (
          <span key={kv.label}>
            {kv.label}
            <b>{kv.value}</b>
          </span>
        ))}
      </div>
    </div>
  );
}
