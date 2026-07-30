import { useState } from 'react';
import { useCapabilities } from './capabilitiesStore';
import { useLicenseModalTrigger } from './licenseModalStore';
import { ActivateForm, LicensePanel, useSubscribeInfo } from '../settings/LicensePanel';

const FEATURES = [
  { name: '个股自动跟踪', desc: '盯盘跟踪，异动自动留言' },
  { name: '深度研究', desc: '一键深度研究，产出结构化报告' },
  { name: '研究库 AI', desc: '审阅、刷新、研究资料对谈' },
  { name: '长期记忆', desc: '偏好与标的下文持久化，跨对话继承' },
];

function monthlyCtaLabel(subscribe: {
  trialDays: number | null;
  priceLabel: string | null;
  listPriceLabel: string | null;
  discountLabel: string | null;
}): string {
  const deal = [
    subscribe.discountLabel,
    subscribe.listPriceLabel ? `原价 ${subscribe.listPriceLabel}` : null,
  ]
    .filter(Boolean)
    .join('，');
  if (subscribe.trialDays) {
    const after = subscribe.priceLabel ? ` · 之后 ${subscribe.priceLabel}` : '';
    const tag = deal ? `（${deal}）` : '';
    return `免费试用 ${subscribe.trialDays} 天${after}${tag}，随时取消`;
  }
  const price = subscribe.priceLabel ? ` · ${subscribe.priceLabel}` : '';
  const tag = subscribe.discountLabel ? `（${subscribe.discountLabel}）` : '';
  return `前往订阅${price}${tag}`;
}

function yearlyCtaLabel(yearly: {
  priceLabel: string | null;
  discountLabel: string | null;
  savingsLabel: string | null;
  trialDays: number | null;
}): string {
  const price = yearly.priceLabel ? ` ${yearly.priceLabel}` : '';
  const deal = [yearly.discountLabel, yearly.savingsLabel].filter(Boolean).join(' · ');
  const tag = deal ? `（${deal}）` : '';
  const trial = yearly.trialDays ? `，同样先免费试用 ${yearly.trialDays} 天` : '';
  return `或选年付${price}${tag}${trial}`;
}

export function Paywall({
  notice,
  onActivated,
}: {
  notice?: 'invalid' | 'expired';
  onActivated: () => void;
}) {
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
        <a
          className="license-paywall-cta"
          href={subscribe.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {monthlyCtaLabel(subscribe)}
        </a>
      ) : null}
      {subscribe?.yearly ? (
        <a
          className="license-paywall-yearly"
          href={subscribe.yearly.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {yearlyCtaLabel(subscribe.yearly)}
        </a>
      ) : null}
      <div className="license-paywall-hint">
        {subscribe?.trialDays ? '试用期内不会扣款；' : ''}
        订阅后授权码发至邮箱，下方粘贴激活
      </div>
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
  const notice =
    license?.state === 'invalid' ? 'invalid' : license?.state === 'expired' ? 'expired' : undefined;

  return (
    <>
      {trigger === 'runtime-403' ? (
        <div className="license-modal-runtime-notice">
          本次操作因授权已失效被拒绝，请重新验证或激活。
        </div>
      ) : null}
      {licensed ? <LicensePanel /> : <Paywall notice={notice} onActivated={close} />}
    </>
  );
}
