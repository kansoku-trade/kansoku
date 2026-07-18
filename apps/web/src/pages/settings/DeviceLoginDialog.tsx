import { useEffect, useState } from "react";
import { errorMessage } from "../../api";
import { client } from "../../client";
import { Button } from "../../ui";
import type { LobeHubDeviceLogin } from "./types";

export function DeviceLoginDialog({
  login,
  closeModal,
  onConnected,
}: {
  login: LobeHubDeviceLogin;
  closeModal: () => void;
  onConnected: () => void;
}) {
  const [status, setStatus] = useState("等待在浏览器中确认…");

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      try {
        const result = await client.lobehub.pollDeviceLogin();
        if (cancelled) return;
        if (result.status === "connected") {
          onConnected();
          closeModal();
          return;
        }
        if (result.status === "denied") {
          setStatus("授权已拒绝，请重新发起登录");
          return;
        }
        if (result.status === "expired") {
          setStatus("验证码已过期，请重新发起登录");
          return;
        }
        timer = setTimeout(poll, result.intervalSeconds * 1000);
      } catch (error) {
        if (!cancelled) setStatus(errorMessage(error));
      }
    };
    timer = setTimeout(poll, login.intervalSeconds * 1000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [closeModal, login.intervalSeconds, onConnected]);

  const url = login.verificationUriComplete ?? login.verificationUri;
  return (
    <div className="settings-device-login">
      <p>请在 LobeHub Cloud 确认登录，并在需要时输入以下验证码。</p>
      <div className="settings-device-code">{login.userCode}</div>
      <div className="settings-provider-meta">{status}</div>
      <div className="settings-cred-actions">
        <Button onClick={() => void navigator.clipboard.writeText(login.userCode)}>复制验证码</Button>
        <Button accent onClick={() => window.open(url, "_blank", "noopener,noreferrer")}>
          打开 LobeHub Cloud
        </Button>
      </div>
    </div>
  );
}
