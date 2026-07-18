import { Button, Spinner } from "../../ui";
import { AnalysisRunDetails } from "./AnalysisRunDetails";
import { useAnalystRun } from "./useAnalystRun";

export function GenerateAnalysis({ sym }: { sym: string }) {
  const run = useAnalystRun(sym);

  return (
    <div className="ai-run-control">
      <div className="ai-reassess">
        <Button onClick={run.start} disabled={run.pending || run.running}>
          {run.running && <Spinner />}
          {run.running ? "AI 分析中…" : "AI 生成分析"}
        </Button>
        {run.hint && <span className="ai-hint">{run.hint}</span>}
      </div>
      {run.status && <AnalysisRunDetails status={run.status} />}
    </div>
  );
}
