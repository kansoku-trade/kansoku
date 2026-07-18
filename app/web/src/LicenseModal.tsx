import { useState } from "react";
import { useCapabilities } from "./capabilitiesStore";
import { useLicenseModalTrigger } from "./licenseModalStore";
import { ActivateForm, LicensePanel, useSubscribeInfo } from "./pages/settings/LicensePanel";

const FEATURES = [
  { name: "个股自动跟踪", desc: "盘中在后台持续跟进关注的标的，异动时自动留言提醒" },
  { name: "深度研究", desc: "对单只股票跑一次深度分析，生成可沉淀的研究文档" },
  { name: "研究库 AI", desc: "AI 刷新研究文档、AI 编辑审阅、与研究资料对话" },
];

function Paywall({ notice, onActivated }: { notice?: "invalid" | "expired"; onActivated: () => void }) {
  const subscribe = useSubscribeInfo();
  const [showActivate, setShowActivate] = useState(notice !== undefined);

  return (
    <div className="license-paywall">
      <div className="license-paywall-hero">
        <div className="license-paywall-title">Kansoku AI</div>
        <div className="license-paywall-tagline">解锁 AI 辅助的交易复盘与研究</div>
      </div>
      <ul className="license-paywall-features">
        {FEATURES.map((f) => (
          <li key={f.name}>
            <span className="license-paywall-feature-name">{f.name}</span>
            <span className="license-paywall-feature-desc">{f.desc}</span>
          </li>
        ))}
      </ul>
      {subscribe?.subscribeUrl ? (
        <a className="license-paywall-cta" href={subscribe.subscribeUrl} target="_blank" rel="noreferrer">
          前往订阅{subscribe.priceLabel ? ` · ${subscribe.priceLabel}` : ""}
        </a>
      ) : null}
      <div className="license-paywall-hint">订阅完成后，授权码会发送到你的邮箱，回来在下方粘贴激活即可。</div>
      {showActivate ? (
        <ActivateForm notice={notice} showSubscribeLink={false} onActivated={onActivated} />
      ) : (
        <button className="license-paywall-toggle" onClick={() => setShowActivate(true)}>
          已有授权码？输入激活
        </button>
      )}
    </div>
  );
}

export function LicenseModalBody({ close }: { close: () => void }) {
  const trigger = useLicenseModalTrigger();
  const { licensed, license } = useCapabilities();
  const notice = license?.state === "invalid" ? "invalid" : license?.state === "expired" ? "expired" : undefined;

  return (
    <>
      {trigger === "runtime-403" ? (
        <div className="license-modal-runtime-notice">本次操作因授权已失效被拒绝，请重新验证或激活。</div>
      ) : null}
      {licensed ? <LicensePanel /> : <Paywall notice={notice} onActivated={close} />}
    </>
  );
}
