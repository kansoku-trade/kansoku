import { useReducer } from "react";
import { chartTargetPath } from "../../../shared/chartUrl";
import type { ChartType } from "../../../shared/types";
import { client } from "../client";
import { navigate } from "../router";
import { Button, Chip, Input, openModal } from "../ui";
import { classifyChartError } from "./chartError";
import { canSubmitNewChart, initialNewChartState, newChartReducer } from "./dialogState";
import { buildChartPayload, CHART_PRESETS } from "./presets";
import { toChartSymbol } from "./symbol";

interface CreateChartResponse {
  id: string;
  type: ChartType;
  symbol: string | null;
}

function NewChartForm({ onDone }: { onDone: () => void }) {
  const [state, dispatch] = useReducer(newChartReducer, initialNewChartState(CHART_PRESETS[0].id));

  const submit = async () => {
    const symbol = toChartSymbol(state.symbolInput);
    if (!symbol) return;
    dispatch({ type: "submitStart" });
    try {
      const { data } = await client.charts.create(buildChartPayload(state.presetId, symbol));
      const created = data as unknown as CreateChartResponse;
      onDone();
      navigate(chartTargetPath({ ...created, created_at: new Date().toISOString() }));
    } catch (err) {
      dispatch({ type: "submitFailure", error: classifyChartError(err) });
    }
  };

  return (
    <div className="new-chart-form">
      <label className="new-chart-label">
        代码
        <Input
          autoFocus
          className="new-chart-symbol-input"
          placeholder="如 MRVL 或 MU.US"
          value={state.symbolInput}
          onChange={(e) => dispatch({ type: "setSymbol", value: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && canSubmitNewChart(state)) submit();
          }}
        />
      </label>

      <div className="new-chart-label">图表类型</div>
      <div className="new-chart-presets">
        {CHART_PRESETS.map((preset) => (
          <Chip
            key={preset.id}
            active={state.presetId === preset.id}
            onClick={() => dispatch({ type: "setPreset", value: preset.id })}
          >
            {preset.label}
          </Chip>
        ))}
      </div>
      <div className="new-chart-preset-desc">
        {CHART_PRESETS.find((p) => p.id === state.presetId)?.description}
      </div>

      {state.error && (
        <div className={`new-chart-error${state.error.kind === "credentials" ? " new-chart-error--credentials" : ""}`}>
          {state.error.message}
          {state.error.kind === "credentials" && (
            <a href="/settings" onClick={onDone}>
              前往设置
            </a>
          )}
        </div>
      )}

      <div className="new-chart-actions">
        <Button onClick={onDone}>取消</Button>
        <Button accent disabled={!canSubmitNewChart(state)} onClick={submit}>
          {state.status === "submitting" ? "创建中…" : "创建图表"}
        </Button>
      </div>
    </div>
  );
}

export function openNewChartDialog(): void {
  openModal({
    title: "新建图表",
    body: (close) => <NewChartForm onDone={close} />,
  });
}
