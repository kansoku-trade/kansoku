import { useRef } from "react";
import type { SepaBuilt } from "@kansoku/shared/types";
import { fmt } from "@web/format";
import { LayerPanel } from "../LayerPanel";
import { SepaSidebar } from "./SepaSidebar";
import { useSepaCharts } from "./useSepaCharts";
import { seriesPalette } from "@web/theme";

export function SepaDashboard({ built }: { built: SepaBuilt }) {
  const mainRef = useRef<HTMLDivElement>(null);
  const rsRef = useRef<HTMLDivElement>(null);
  const vrRef = useRef<HTMLDivElement>(null);
  const vpCanvasRef = useRef<HTMLCanvasElement>(null);
  const groups = useSepaCharts(built.chart, mainRef, rsRef, vrRef, vpCanvasRef);
  const kv = built.sidebar.keyValues;

  return (
    <div className="layout">
      <div className="charts-col">
        <div className="chart-block main">
          <div className="chart-label">主图 · 日 K + 均线</div>
          <div className="chart-legend">
            <span>
              <span className="swatch" style={{ background: seriesPalette[0] }} />
              MA50 ${fmt(kv.ma50)}
            </span>
            <span>
              <span className="swatch" style={{ background: seriesPalette[4] }} />
              MA150 ${fmt(kv.ma150)}
            </span>
            <span>
              <span className="swatch" style={{ background: seriesPalette[1] }} />
              MA200 ${fmt(kv.ma200)}
            </span>
          </div>
          <LayerPanel groups={groups} />
          <canvas ref={vpCanvasRef} className="vp-canvas" />
          <div ref={mainRef} className="chart-host" />
        </div>
        <div className="chart-block rs">
          <div className="chart-label">RS vs SPY (跑赢百分点)</div>
          <div className="chart-legend">
            <span>
              <span className="swatch" style={{ background: seriesPalette[2] }} />
              21d
            </span>
            <span>
              <span className="swatch" style={{ background: seriesPalette[4] }} />
              63d
            </span>
            <span>
              <span className="swatch" style={{ background: seriesPalette[3] }} />
              126d
            </span>
          </div>
          <div ref={rsRef} className="chart-host" />
        </div>
        <div className="chart-block vol">
          <div className="chart-label">量能比 (vs 20MA)</div>
          <div ref={vrRef} className="chart-host" />
        </div>
      </div>
      <SepaSidebar built={built} />
    </div>
  );
}
