import { Component, type ReactNode } from "react";
import type { SimpleBuilt } from "../../../../shared/types";
import { CohortChart } from "./CohortChart";
import { FlowChart } from "./FlowChart";

class ChartErrorBoundary extends Component<{ children: ReactNode }, { message: string | null }> {
  state = { message: null as string | null };

  static getDerivedStateFromError(err: unknown) {
    return { message: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.message) return <div className="error-box">渲染失败：{this.state.message}</div>;
    return this.props.children;
  }
}

export function SimpleChartView({ built }: { built: SimpleBuilt }) {
  return (
    <div className="simple-page">
      {built.subtitle && <div className="subtitle">{built.subtitle}</div>}
      <div className={built.chartType === "flow" ? "simple-host" : "simple-scroll"}>
        <ChartErrorBoundary>
          {built.chartType === "flow" ? <FlowChart rows={built.rows} /> : <CohortChart rows={built.rows} />}
        </ChartErrorBoundary>
      </div>
    </div>
  );
}
