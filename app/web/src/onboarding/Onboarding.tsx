import { Button, Card } from "../ui";
import { CredentialsForm } from "../pages/settings/CredentialsForm";
import type { DesktopCredentialsBridge } from "../pages/settings/desktopCredentials";

const LONGBRIDGE_PORTAL_URL = "https://open.longbridgeapp.com/";

export function Onboarding({
  bridge,
  onDone,
  onSkip,
}: {
  bridge: DesktopCredentialsBridge;
  onDone: () => void;
  onSkip: () => void;
}) {
  return (
    <div className="page onboarding-page">
      <Card className="onboarding-card">
        <h1>欢迎使用</h1>
        <p className="onboarding-explainer">
          行情数据来自长桥（Longbridge）开放平台，需要一组你自己的长桥凭证（App Key / App Secret / Access
          Token）。凭证只会加密保存在本机，不会上传到任何第三方服务器。还没有凭证的话，先到{" "}
          <a href={LONGBRIDGE_PORTAL_URL} target="_blank" rel="noreferrer">
            长桥开放平台
          </a>{" "}
          申请一组。
        </p>

        <CredentialsForm bridge={bridge} submitLabel="保存并进入" onSaved={onDone} hint="填入三项凭证后先测试连接，确认无误后再保存。" />

        <div className="onboarding-skip-row">
          <Button onClick={onSkip}>跳过，稍后再配置</Button>
        </div>
      </Card>
    </div>
  );
}
