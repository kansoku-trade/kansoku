import { useCallback, useEffect, useState } from "react";
import { Badge, Button } from "@web/ui";
import {
  getDesktopDataRootBridge,
  isDataRootResetDisabled,
  type DataRootBridgeStatus,
} from "./desktopDataRoot";

const MODE_LABEL: Record<DataRootBridgeStatus["mode"], string> = {
  default: "系统默认",
  custom: "自定义",
  env: "环境变量",
  "dev-repo": "开发仓库",
};

const DEGRADED_MESSAGE =
  "自定义数据目录不可用，已临时使用系统默认。请重新选择或恢复默认。";

export function DataRootSection() {
  const bridge = getDesktopDataRootBridge();
  const [status, setStatus] = useState<DataRootBridgeStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!bridge) return;
    try {
      const next = await bridge.get();
      setStatus(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [bridge]);

  useEffect(() => {
    void reload();
  }, [reload]);

  if (!bridge) return null;

  const mode = status?.mode;
  const envLocked = mode === "env";
  const pickDisabled = busy || envLocked;
  const resetDisabled = isDataRootResetDisabled(status, busy);

  const run = async (action: "pick" | "reset") => {
    setBusy(true);
    setError(null);
    try {
      if (action === "pick") await bridge.pick();
      else await bridge.reset();
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-conn-section settings-conn-longbridge">
      <div className="settings-conn-title">
        <span>数据目录</span>
        {mode ? (
          <Badge tone={status?.degraded ? "down" : mode === "custom" ? "accent" : undefined}>
            {MODE_LABEL[mode]}
          </Badge>
        ) : null}
      </div>

      {status?.effectivePath ? (
        <div className="settings-provider-meta">{status.effectivePath}</div>
      ) : (
        <div className="note-block">加载中…</div>
      )}

      {status?.degraded ? <div className="settings-warning-strip">{DEGRADED_MESSAGE}</div> : null}

      {status?.restartPending ? (
        <div className="settings-test-result settings-test-result--ok">设置已保存，重启 App 后生效</div>
      ) : null}

      {mode === "env" ? (
        <div className="note-block">当前由环境变量 TRADE_PROJECT_ROOT 覆盖，设置页无法更改。</div>
      ) : null}

      {mode === "dev-repo" ? (
        <div className="note-block">开发模式使用仓库目录；点选择会提示无需设置。</div>
      ) : null}

      <div className="note-block">
        请选择含 journal/ 的仓库根（或空目录）；改完需重启；不要与 pnpm start 同时写同一数据目录。
      </div>

      {error ? <div className="settings-test-result settings-test-result--fail">{error}</div> : null}

      <div className="settings-cred-actions">
        <Button disabled={pickDisabled} onClick={() => void run("pick")}>
          选择…
        </Button>
        <Button disabled={resetDisabled} onClick={() => void run("reset")}>
          恢复默认
        </Button>
      </div>
    </section>
  );
}
