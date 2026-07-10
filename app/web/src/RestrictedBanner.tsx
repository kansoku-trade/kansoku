import { getDesktopCredentialsBridge } from "./pages/settings/desktopCredentials";
import { dismissRestrictedBanner, useRestrictedMode } from "./restrictedMode";
import { navigate } from "./router";

export function RestrictedBanner() {
  const { restricted, dismissed } = useRestrictedMode();
  if (!restricted || dismissed) return null;

  const canConfigure = getDesktopCredentialsBridge() !== null;

  return (
    <div className="restricted-banner">
      <span>未配置行情凭证 — 部分功能不可用</span>
      <div className="restricted-banner-actions">
        {canConfigure && (
          <button className="restricted-banner-link" onClick={() => navigate("/settings")}>
            去设置
          </button>
        )}
        <button className="restricted-banner-dismiss" onClick={dismissRestrictedBanner} aria-label="关闭">
          ×
        </button>
      </div>
    </div>
  );
}
