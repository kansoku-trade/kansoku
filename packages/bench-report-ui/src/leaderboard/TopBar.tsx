export function TopBar({ runId }: { runId: string }) {
  return (
    <div className="top">
      <div className="inner">
        <div className="brand">
          Kansoku <span>/ Trading Benchmark</span>
        </div>
        <div className="r">
          <span>
            run <kbd>{runId}</kbd>
          </span>
        </div>
      </div>
    </div>
  );
}
