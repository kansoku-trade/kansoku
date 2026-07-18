import type { SettingsViewModel } from "./settingsViewModel";

type Summary = SettingsViewModel["summary"];

export function SettingsStatusStrip({
  summary,
  usageError,
  onRetryUsage,
}: {
  summary: Summary;
  usageError: string | null;
  onRetryUsage: () => void;
}) {
  return (
    <div className="settings-statusline" aria-label="设置状态总览">
      <span className={"settings-statusline-state settings-statusline-state--" + summary.statusTone}>
        {summary.statusLabel}
      </span>
      <span className="settings-statusline-sep">·</span>
      <span>{summary.enabledLabel}</span>
      <span className="settings-statusline-usage num">
        {usageError ? (
          <>
            今日用量读取失败
            <button className="settings-statusline-retry" type="button" onClick={onRetryUsage}>
              重试
            </button>
          </>
        ) : summary.usageLabel === "暂不可用" ? (
          "今日用量暂不可用"
        ) : (
          "今日 " + summary.usageLabel
        )}
      </span>
    </div>
  );
}
