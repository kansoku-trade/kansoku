import { clsx } from 'clsx';
import type { LeaderboardModelRowView, LeaderboardReportViewData } from '../types';
import { Gauge } from './Gauge';

function Row({
  row,
  selected,
  onSelect,
}: {
  row: LeaderboardModelRowView;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const rowClass = clsx('row', row.isBaseline && 'base', selected && 'sel');
  return (
    <tr className={rowClass} data-model={row.id} onClick={() => onSelect(row.id)}>
      <td>{row.rank ?? '—'}</td>
      <td>
        <span className="mname">
          {row.name}
          {row.vendor ? <span className="mvend">{row.vendor}</span> : null}
          {row.baselineBadge ? <span className="btag">baseline</span> : null}
        </span>
      </td>
      <td>
        <span className="total">{row.total}</span>
        {row.delta ? <span className={`delta ${row.delta.tone}`}>{row.delta.text}</span> : null}
      </td>
      <td>
        <Gauge gauge={row.judgment} />
      </td>
      <td>
        {row.efficiency ? <Gauge gauge={row.efficiency} /> : <span className="num muted">—</span>}
      </td>
      <td>
        <span className="num">{row.winRate}</span>
      </td>
      <td>
        <span className="num">{row.abstainRate}</span>
      </td>
      <td>
        <span className="num">{row.cost}</span>
      </td>
      <td>
        <span className="num">{row.duration}</span>
      </td>
      <td>
        <span className="num">{row.violationRate}</span>
      </td>
    </tr>
  );
}

export function LeaderboardTable({
  data,
  selectedId,
  onSelect,
}: {
  data: LeaderboardReportViewData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="panel">
      <div className="panelhead">
        <h3>总榜</h3>
        <span className="desc">按总分排序 · 点行下钻画像</span>
        <span className="r">n = {data.n}</span>
      </div>
      <div className="tblwrap">
        <table className="tbl">
          <thead>
            <tr>
              <th>#</th>
              <th>模型</th>
              <th className="sorted">总分</th>
              <th>判断分</th>
              <th>效率分</th>
              <th>胜率</th>
              <th>观望率</th>
              <th>成本</th>
              <th>耗时</th>
              <th>违规</th>
            </tr>
          </thead>
          <tbody>
            {data.realRows.map((row) => (
              <Row key={row.id} row={row} selected={row.id === selectedId} onSelect={onSelect} />
            ))}
            {data.passLineLabel ? (
              <tr className="passline" data-label={data.passLineLabel}>
                <td colSpan={10} />
              </tr>
            ) : null}
            {data.baselineRows.map((row) => (
              <Row key={row.id} row={row} selected={row.id === selectedId} onSelect={onSelect} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
