import { useEffect, useState } from "react";
import { errorMessage } from "../../api";
import { useQuery } from "../../apiHooks";
import { clearRestricted } from "../../restrictedMode";
import { Badge, Button, Card, openModal, SectionTitle } from "../../ui";
import { CredentialsForm } from "./CredentialsForm";
import { deriveCredentialsStatusLabel } from "./credentialsStatusLabel";
import { CREDENTIALS_STATUS_URL, getDesktopCredentialsBridge, type CredentialsGetResult } from "./desktopCredentials";

export function CredentialsSettingsCard() {
  const bridge = getDesktopCredentialsBridge();
  const [storeStatus, setStoreStatus] = useState<CredentialsGetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);
  const { data: serverStatus, reload: reloadServerStatus } = useQuery<CredentialsGetResult>(
    bridge ? CREDENTIALS_STATUS_URL : null,
  );

  const reloadStoreStatus = () => {
    if (!bridge) return;
    bridge.get().then(setStoreStatus).catch((err) => setError(errorMessage(err)));
  };

  useEffect(reloadStoreStatus, [bridge]);

  if (!bridge) return null;

  const refreshAfterChange = () => {
    reloadStoreStatus();
    reloadServerStatus();
    clearRestricted();
  };

  const handleClear = () => {
    openModal({
      title: "清除凭证",
      body: (closeModal) => (
        <div className="settings-reset-confirm">
          <p>会清空本机保存的长桥凭证，行情功能将不可用直到重新配置。确定继续吗？</p>
          <div className="settings-cred-actions">
            <Button onClick={closeModal}>取消</Button>
            <Button
              accent
              disabled={clearing}
              onClick={async () => {
                setClearing(true);
                try {
                  await bridge.clear();
                  refreshAfterChange();
                  closeModal();
                } catch (err) {
                  setError(errorMessage(err));
                } finally {
                  setClearing(false);
                }
              }}
            >
              确认清除
            </Button>
          </div>
        </div>
      ),
    });
  };

  const configured = serverStatus?.configured ?? false;
  const statusLabel = deriveCredentialsStatusLabel({
    serverConfigured: configured,
    storeConfigured: storeStatus?.configured ?? false,
    lastError: storeStatus?.lastError ?? null,
  });

  return (
    <Card className="settings-credentials-card">
      <SectionTitle>长桥凭证</SectionTitle>
      <div className="settings-cred-row">
        <span className="settings-cred-name">配置状态</span>
        <Badge tone={configured ? "up" : "down"}>{statusLabel}</Badge>
        {storeStatus?.configured && (
          <span className="settings-cred-actions">
            <Button onClick={handleClear} disabled={clearing}>
              清除凭证
            </Button>
          </span>
        )}
      </div>

      {error && <div className="settings-test-result settings-test-result--fail">{error}</div>}

      <CredentialsForm
        bridge={bridge}
        submitLabel="保存"
        hint={
          storeStatus?.configured
            ? "出于安全考虑不回显已保存的凭证；如需更新，请重新填写全部三项后保存。"
            : "填入三项凭证后先测试连接，确认无误后再保存。"
        }
        onSaved={refreshAfterChange}
      />
    </Card>
  );
}
