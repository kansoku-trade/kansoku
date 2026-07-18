import { useState } from "react";
import { errorMessage } from "@web/api";
import { useQuery } from "@web/apiHooks";
import { refreshCapabilities, useCapabilities } from "@web/capabilitiesStore";
import { client } from "@web/client";
import { openLicenseModal } from "@web/licenseModalStore";
import { Badge, Button, Input, openModal } from "@web/ui";

function activateErrorMessage(raw: string): string {
  if (/responded (401|404)/.test(raw)) return "授权码无效，请检查后重新输入";
  if (/responded (409|422)/.test(raw)) return "此授权码的设备数已达上限，请先在其他设备停用后再试";
  return `激活失败：${raw}`;
}

function DeactivateConfirm({ closeModal }: { closeModal: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const deactivate = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.license.deactivate();
      await refreshCapabilities();
      closeModal();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-reset-confirm">
      <p>停用后本机将失去 AI 功能授权，可随时用授权码重新激活。确定继续吗？</p>
      {error ? <div className="settings-test-result settings-test-result--fail">{error}</div> : null}
      <div className="settings-cred-actions">
        <Button disabled={busy} onClick={closeModal}>
          取消
        </Button>
        <Button accent disabled={busy} onClick={() => void deactivate()}>
          {busy ? "停用中…" : "确认停用"}
        </Button>
      </div>
    </div>
  );
}

export function useSubscribeInfo() {
  const { data } = useQuery("settings.getSubscribeUrl", () => client.settings.getSubscribeUrl());
  return data ?? null;
}

export function ActivateForm({
  notice,
  showSubscribeLink = true,
  onActivated,
}: {
  notice?: "invalid" | "expired";
  showSubscribeLink?: boolean;
  onActivated?: () => void;
}) {
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const subscribeData = useSubscribeInfo();

  const activate = async () => {
    const trimmed = key.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await client.license.activate({ key: trimmed });
      if (!result.activated) {
        setError(activateErrorMessage(result.error));
        return;
      }
      await refreshCapabilities();
      setKey("");
      onActivated?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="settings-time-preference license-activate-row">
      {notice === "invalid" ? (
        <div className="settings-preference-description license-invalid-notice">
          此授权码已失效（可能是退订或更换了套餐），请重新输入有效的授权码。
        </div>
      ) : null}
      {notice === "expired" ? (
        <div className="settings-preference-description license-expired-notice">
          授权已过期：超过 14 天未能联网验证。请检查网络连接——恢复联网后会自动重新验证；若订阅已到期，请重新订阅或输入新的授权码。
        </div>
      ) : null}
      <div className="license-input-row">
        <Input
          placeholder="输入授权码"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void activate();
          }}
          disabled={busy}
        />
        <Button accent disabled={busy || !key.trim()} onClick={() => void activate()}>
          {busy ? "激活中…" : "激活"}
        </Button>
      </div>
      {error ? <div className="settings-test-result settings-test-result--fail">{error}</div> : null}
      {showSubscribeLink && subscribeData?.subscribeUrl ? (
        <button type="button" className="license-subscribe-link" onClick={() => openLicenseModal("guard")}>
          还没有授权码？{subscribeData.trialDays ? `免费试用 ${subscribeData.trialDays} 天` : "前往订阅"}
        </button>
      ) : null}
    </div>
  );
}

function LicensedStatus({ state, deviceName, maskedKey, graceUntil }: {
  state: "licensed" | "grace";
  deviceName?: string;
  maskedKey?: string;
  graceUntil?: string;
}) {
  return (
    <div className="settings-time-preference license-status-row">
      <div className="settings-preference-copy">
        <div className="settings-preference-name">
          {state === "grace" ? <Badge tone="accent">离线宽限中</Badge> : <Badge tone="up">已授权</Badge>}
        </div>
        <div className="settings-preference-description">
          {maskedKey ? `授权码 ${maskedKey}` : null}
          {deviceName ? ` · 设备 ${deviceName}` : null}
          {state === "grace" && graceUntil
            ? ` · 离线宽限至 ${new Date(graceUntil).toLocaleString()}`
            : null}
        </div>
      </div>
      <Button
        onClick={() =>
          openModal({
            title: "停用本机",
            body: (closeModal) => <DeactivateConfirm closeModal={closeModal} />,
          })
        }
      >
        停用本机
      </Button>
    </div>
  );
}

export function LicensePanel() {
  const { licensed, license } = useCapabilities();

  if (licensed) {
    return (
      <LicensedStatus
        state={license?.state === "grace" ? "grace" : "licensed"}
        deviceName={license?.deviceName}
        maskedKey={license?.maskedKey}
        graceUntil={license?.graceUntil}
      />
    );
  }

  const notice = license?.state === "invalid" ? "invalid" : license?.state === "expired" ? "expired" : undefined;
  return <ActivateForm notice={notice} />;
}
