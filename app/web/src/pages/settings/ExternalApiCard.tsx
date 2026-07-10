import { useEffect, useState } from "react";
import { errorMessage } from "../../api";
import { Badge, Button, Card, openModal, SectionTitle } from "../../ui";
import { getExternalApiBridge, maskToken, type ExternalApiState } from "./externalApiClient";

export function ExternalApiCard() {
  const bridge = getExternalApiBridge();
  const [state, setState] = useState<ExternalApiState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!bridge) return;
    bridge.getState().then(setState).catch((err) => setError(errorMessage(err)));
  }, [bridge]);

  if (!bridge) return null;

  const toggle = async () => {
    if (!state) return;
    setBusy(true);
    setError(null);
    try {
      setState(state.enabled ? await bridge.disable() : await bridge.enable());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!state?.token) return;
    try {
      await navigator.clipboard.writeText(state.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setError("复制失败，请手动选中复制");
    }
  };

  const handleReset = () => {
    openModal({
      title: "重置 token",
      body: (closeModal) => (
        <div className="settings-reset-confirm">
          <p>旧 token 会立刻失效，正在用它连接的客户端需要改用新 token。确定继续吗？</p>
          <div className="settings-cred-actions">
            <Button onClick={closeModal}>取消</Button>
            <Button
              accent
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  setState(await bridge.resetToken());
                  closeModal();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setBusy(false);
                }
              }}
            >
              确认重置
            </Button>
          </div>
        </div>
      ),
    });
  };

  return (
    <Card className="settings-external-api-card">
      <SectionTitle>本机 API</SectionTitle>
      <div className="settings-cred-row">
        <span className="settings-cred-name">开关</span>
        <Badge tone={state?.enabled ? "up" : undefined}>{state?.enabled ? "运行中" : "已停用"}</Badge>
        <span className="settings-cred-actions">
          <Button accent={!state?.enabled} disabled={busy || !state} onClick={toggle}>
            {state?.enabled ? "停用" : "启用"}
          </Button>
        </span>
      </div>

      {state?.enabled && state.port != null && (
        <div className="settings-cred-row">
          <span className="settings-cred-name">端口</span>
          <span className="settings-cred-meta">127.0.0.1:{state.port}</span>
        </div>
      )}

      {state?.token && (
        <div className="settings-cred-row">
          <span className="settings-cred-name">Token</span>
          <span className="settings-cred-meta settings-external-api-token">
            {revealed ? state.token : maskToken(state.token)}
          </span>
          <span className="settings-cred-actions">
            <Button onClick={() => setRevealed((v) => !v)}>{revealed ? "隐藏" : "显示"}</Button>
            <Button onClick={copyToken}>{copied ? "已复制" : "复制"}</Button>
            <Button onClick={handleReset}>重置</Button>
          </span>
        </div>
      )}

      {error && <div className="settings-test-result settings-test-result--fail">{error}</div>}

      <div className="settings-footer-note">
        启用后本机会监听 127.0.0.1，供 Claude Code 图表 skill 等命令行工具用 token 访问；token
        等同完整 API 权限，不要发给外部或暴露到公网。停用或退出应用会关闭该端口。
      </div>
    </Card>
  );
}
