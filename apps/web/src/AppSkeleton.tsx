function isElectronShell(): boolean {
  return typeof navigator !== "undefined" && /\bElectron\b/.test(navigator.userAgent);
}

function Bone({ className = "" }: { className?: string }) {
  return <div className={`app-skeleton-bone${className ? ` ${className}` : ""}`} />;
}

function QuoteCellBone() {
  return (
    <div className="quote-cell app-skeleton-quote" aria-hidden="true">
      <Bone className="app-skeleton-bone--qc-sym" />
      <Bone className="app-skeleton-bone--qc-price" />
      <Bone className="app-skeleton-bone--qc-pct" />
    </div>
  );
}

function SymbolCardBone() {
  return (
    <div className="card app-skeleton-symbol-card" aria-hidden="true">
      <div className="app-skeleton-symbol-head">
        <Bone className="app-skeleton-bone--sym" />
        <Bone className="app-skeleton-bone--badge" />
        <Bone className="app-skeleton-bone--quote" />
      </div>
      <div className="app-skeleton-symbol-levels">
        <Bone className="app-skeleton-bone--level" />
        <Bone className="app-skeleton-bone--level" />
        <Bone className="app-skeleton-bone--level" />
      </div>
      <Bone className="app-skeleton-bone--comment" />
    </div>
  );
}

export function AppSkeleton() {
  const desktop = isElectronShell();

  return (
    <div
      className={`app-skeleton${desktop ? " app-skeleton--desktop" : ""}`}
      aria-busy="true"
      aria-label="加载中"
    >
      {desktop && (
        <div className="app-skeleton-titlebar">
          <div className="app-skeleton-traffic" />
          <div className="app-skeleton-tabstrip">
            <Bone className="app-skeleton-bone--tab" />
          </div>
        </div>
      )}

      <div className="page home-page">
        <h1>盘面</h1>
        <div className="sub">盘中看盘、盘后复盘，随时段自动切换</div>

        <div className="quote-bar" aria-hidden="true">
          <QuoteCellBone />
          <QuoteCellBone />
          <QuoteCellBone />
          <QuoteCellBone />
          <QuoteCellBone />
        </div>

        <div className="quickbar" aria-hidden="true">
          <Bone className="app-skeleton-bone--input" />
          <Bone className="app-skeleton-bone--chip" />
          <Bone className="app-skeleton-bone--chip" />
        </div>

        <div className="cross-section-switcher" aria-hidden="true">
          <Bone className="app-skeleton-bone--date" />
        </div>

        <div className="home-grid">
          <div className="home-main">
            <div className="section-title">看盘</div>
            <div className="overview-grid" aria-hidden="true">
              <SymbolCardBone />
              <SymbolCardBone />
              <SymbolCardBone />
              <SymbolCardBone />
            </div>
            <div className="cross-section-charts" aria-hidden="true">
              <Bone className="app-skeleton-bone--chart-title" />
              <Bone className="app-skeleton-bone--chart" />
            </div>
          </div>
          <div className="home-side">
            <div className="section-title">持仓</div>
            <div className="card positions-card app-skeleton-positions" aria-hidden="true">
              <div className="app-skeleton-positions-summary">
                <Bone className="app-skeleton-bone--stat" />
                <Bone className="app-skeleton-bone--stat" />
                <Bone className="app-skeleton-bone--stat" />
                <Bone className="app-skeleton-bone--stat" />
              </div>
              <div className="app-skeleton-positions-rows">
                <Bone className="app-skeleton-bone--row" />
                <Bone className="app-skeleton-bone--row" />
                <Bone className="app-skeleton-bone--row" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
