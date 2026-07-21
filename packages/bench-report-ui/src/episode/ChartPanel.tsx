import { useMemo, useRef } from 'react';
import type {
  EpisodeReportCaseDetailView,
  EpisodeReportChartPayload,
  EpisodeReportChartTimeframe,
} from '../types';
import { ToggleGroup } from '../ui/ToggleGroup';
import { ProcessChain } from './ProcessChain';
import { buildChartScene, type ChartScene, type ChartSelection } from './chart/scene';
import { useEpisodeChart } from './useEpisodeChart';

const TIMEFRAME_LABEL: Record<EpisodeReportChartTimeframe, string> = {
  h1: '1 小时',
  day: '日线',
  week: '周线',
};

function LiveChart({ chartId, scene }: { chartId: string; scene: ChartScene }) {
  const ref = useRef<HTMLDivElement>(null);
  useEpisodeChart(ref, scene);
  return <div className="tv-chart" id={chartId} ref={ref} />;
}

export function ChartPanel({
  detail,
  payload,
  timeframe,
  barIndex,
  selection,
  activeNodeSeq,
  onSelectTimeframe,
  onNodeClick,
  onReset,
}: {
  detail: EpisodeReportCaseDetailView;
  payload: EpisodeReportChartPayload | undefined;
  timeframe: EpisodeReportChartTimeframe;
  barIndex: number;
  selection: ChartSelection;
  activeNodeSeq: number | null;
  onSelectTimeframe: (timeframe: EpisodeReportChartTimeframe) => void;
  onNodeClick: (timeframe: EpisodeReportChartTimeframe, barIndex: number, sequence: number) => void;
  onReset: () => void;
}) {
  const scene = useMemo(
    () => (payload ? buildChartScene(payload, timeframe, barIndex, selection) : null),
    [payload, timeframe, barIndex, selection],
  );

  return (
    <section className="chart-panel">
      <div className="chart-toolbar">
        <div>
          <strong>K 线与成交量</strong>
          <span>点击工具节点可回看该 B 编号当时可见的数据</span>
        </div>
        <ToggleGroup
          ariaLabel="K 线周期"
          value={timeframe}
          options={detail.availableTimeframes.map((tf) => ({
            value: tf,
            label: TIMEFRAME_LABEL[tf],
          }))}
          onChange={onSelectTimeframe}
        />
      </div>
      {payload && scene ? (
        <LiveChart chartId={detail.chartId} scene={scene} />
      ) : (
        <div className="tv-chart" id={detail.chartId}>
          <span className="chart-loading">加载图表…</span>
        </div>
      )}
      <div className="chart-legend">
        <span>
          <i className="entry" />
          计划入场
        </span>
        <span>
          <i className="target" />
          止盈
        </span>
        <span>
          <i className="stop" />
          止损
        </span>
        <span>
          <i className="decision" />
          决策位置
        </span>
        <span>
          <i className="ema" />
          EMA20
        </span>
        <span className="chart-range">{scene?.rangeText ?? ''}</span>
      </div>
      <ProcessChain
        detail={detail}
        activeNodeSeq={activeNodeSeq}
        onNodeClick={onNodeClick}
        onReset={onReset}
      />
    </section>
  );
}