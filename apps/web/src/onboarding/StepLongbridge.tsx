import { Button, Card } from "../ui";
import type { CredentialsGetResult } from "../pages/settings/desktopCredentials";

const INSTALL_URL = "https://open.longbridge.com/docs/cli/install";

export function StepLongbridge({
  status,
  onRecheck,
}: {
  status: CredentialsGetResult | null;
  onRecheck: () => void;
}) {
  const state = status?.state ?? "cli_missing";
  const title = state === "cli_missing" ? "安装 Longbridge CLI" : state === "login_required" ? "登录长桥账号" : "修复登录状态";
  const command = state === "cli_missing" ? "curl -fsSL https://open.longbridge.com/longbridge/longbridge-terminal/install | sh" : "longbridge auth login";
  const explanation =
    state === "cli_missing"
      ? "Kansoku 使用本机 Longbridge CLI 获取行情和账户数据。安装完成后请返回这里重新检测。"
      : state === "login_required"
        ? "CLI 已安装，但尚未登录。请在终端执行登录命令，并在浏览器中完成授权。"
        : "CLI 的登录文件无法读取或已经失效。请重新登录；如果问题持续，请升级 Longbridge CLI。";

  return (
    <Card className="onboarding-card">
      <p className="onboarding-welcome">欢迎使用 Kansoku —— 先连上行情数据，再配一下 AI，就能开始了。</p>
      <h1>{title}</h1>
      <p className="onboarding-explainer">{explanation}</p>
      <pre className="onboarding-cli-command"><code>{command}</code></pre>
      {status?.cliPath && <p className="onboarding-explainer">已找到：{status.cliPath}</p>}
      {status?.lastError && <div className="settings-test-result settings-test-result--fail">{status.lastError}</div>}
      <div className="settings-cred-actions">
        <Button onClick={() => window.open(INSTALL_URL, "_blank", "noopener,noreferrer")}>查看安装说明</Button>
        <Button accent onClick={onRecheck}>重新检测</Button>
      </div>
    </Card>
  );
}
