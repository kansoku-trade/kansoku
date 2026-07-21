import type { LeaderboardDetailCardView, LeaderboardReportViewData } from '../types';
import { Tooltip } from '../ui/Tooltip';

function dotSummary(detail: LeaderboardDetailCardView | undefined) {
  if (!detail) return null;
  const rows = detail.sections.flatMap((section) => section.rows).slice(0, 4);
  if (rows.length === 0) return null;
  return (
    <>
      <strong>{detail.name}</strong>
      <dl className="dot-tip">
        {rows.map((row) => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd className={row.tone || undefined}>{row.value}</dd>
          </div>
        ))}
      </dl>
    </>
  );
}

export function ScatterPanel({
  data,
  selectedId,
  onSelect,
}: {
  data: LeaderboardReportViewData;
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const { scatter } = data;
  const { width, height, padL, padT, innerRight, innerBottom } = scatter;

  return (
    <div className="plotpanel">
      <div className="head">
        <h3>判断分 vs 效率分</h3>
        <span className="note">点选联动</span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="判断分对效率分散点图">
        <line className="gridln" x1={padL} y1={padT} x2={padL} y2={innerBottom} />
        <line className="gridln" x1={padL} y1={innerBottom} x2={innerRight} y2={innerBottom} />
        {scatter.xTicks.map((tick) => (
          <g key={`x${tick.cx}`}>
            <line className="gridln dash" x1={tick.cx} y1={padT} x2={tick.cx} y2={innerBottom} />
            <text className="axlab" x={tick.cx} y={innerBottom + 14} textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}
        {scatter.yTicks.map((tick) => (
          <g key={`y${tick.cy}`}>
            <line className="gridln dash" x1={padL} y1={tick.cy} x2={innerRight} y2={tick.cy} />
            <text className="axlab" x={padL - 8} y={(tick.cy ?? 0) + 3} textAnchor="end">
              {tick.label}
            </text>
          </g>
        ))}
        {scatter.baseline ? (
          <g>
            <line
              className="baseln"
              x1={padL}
              y1={scatter.baseline.y}
              x2={innerRight}
              y2={scatter.baseline.y}
            />
            <text className="baslab" x={padL + 4} y={scatter.baseline.y - 4}>
              {scatter.baseline.label}
            </text>
          </g>
        ) : null}
        {scatter.dots.map((dot) => {
          const sel = dot.id === selectedId;
          const dotClass = ['dot', sel ? 'sel' : '', dot.lead ? 'lead' : '', dot.below ? 'below' : '']
            .filter(Boolean)
            .join(' ');
          const labelClass = ['dotlab', sel ? 'sel' : '', dot.below ? 'dim' : ''].filter(Boolean).join(' ');
          const summary = dotSummary(data.details[dot.id]);
          const circle = (
            <circle
              className={dotClass}
              data-model={dot.id}
              cx={dot.cx}
              cy={dot.cy}
              r={dot.r}
              onClick={() => onSelect(dot.id)}
            />
          );
          return (
            <g key={dot.id}>
              {summary ? (
                <Tooltip content={summary} render={circle}>
                  <></>
                </Tooltip>
              ) : (
                circle
              )}
              <text className={labelClass} x={dot.labelX} y={dot.labelY} textAnchor={dot.anchor}>
                {dot.name}
              </text>
            </g>
          );
        })}
        <text className="axtitle" x={padL - 32} y={padT - 6}>
          Judgment ↑
        </text>
        <text className="axtitle" x={innerRight} y={height - 6} textAnchor="end">
          Efficiency →
        </text>
      </svg>
      <div className="plotlegend">
        <span>
          <span className="sw" />
          模型（accent = 榜首）
        </span>
        {data.scatterLegend.belowLabel ? (
          <span>
            <span className="sw below" />
            {data.scatterLegend.belowLabel}
          </span>
        ) : null}
      </div>
    </div>
  );
}
