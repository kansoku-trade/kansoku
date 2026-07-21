import type { EpisodeReportViewData } from '../types';
import { fmtPercent, fmtSigned } from './format';

export function ReasonTable({ data }: { data: EpisodeReportViewData }) {
  const { reasonTable } = data;
  return (
    <section className="panel reason-panel">
      <div className="panel-title">
        <h2>交易原因统计</h2>
        <span>{reasonTable.coverageLabel}</span>
      </div>
      {reasonTable.rows.length === 0 ? (
        <p className="reason-empty">
          该运行没有结构化交易理由；历史结果仍可读取，但不进入原因表现统计。
        </p>
      ) : (
        <div className="table-scroll">
          <table className="compact-table reason-table">
            <thead>
              <tr>
                <th>模型</th>
                <th>主原因</th>
                <th>动作</th>
                <th>入场 / 成交</th>
                <th>胜率</th>
                <th>AVG NET R</th>
                <th>TOTAL NET R</th>
              </tr>
            </thead>
            <tbody>
              {reasonTable.rows.map((stat) => {
                const breakdown = stat.actionBreakdown
                  .map((item) => `${item.actionLabel} ${item.count}`)
                  .join(' · ');
                return (
                  <tr key={`${stat.model}-${stat.category}`}>
                    <td>
                      <strong>{stat.model}</strong>
                    </td>
                    <td>
                      <strong>{stat.categoryLabel}</strong>
                      <small>{stat.category}</small>
                    </td>
                    <td>
                      <strong>{stat.actions}</strong>
                      <small>{breakdown || '—'}</small>
                    </td>
                    <td>
                      {stat.entries} / {stat.trades}
                    </td>
                    <td>{fmtPercent(stat.winRate)}</td>
                    <td className={`mono ${stat.tone}`}>{fmtSigned(stat.averageNetR, 3)}</td>
                    <td className={`mono ${stat.totalNetR > 0 ? 'positive' : stat.totalNetR < 0 ? 'negative' : 'neutral'}`}>
                      {fmtSigned(stat.totalNetR, 3)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}