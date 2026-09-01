import { useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { useCapabilities } from './capabilitiesStore';
import { useLicenseModalTrigger } from './licenseModalStore';
import { ActivateForm, LicensePanel, useSubscribeInfo } from '../settings/LicensePanel';
import { colors, fontSizes, radii, sizes } from '../../theme/tokens.stylex';

const FEATURES = [
  { name: '个股自动跟踪', desc: '盯盘跟踪，异动自动留言' },
  { name: '深度研究', desc: '一键深度研究，产出结构化报告' },
  { name: '研究库 AI', desc: '审阅、刷新、研究资料对谈' },
  { name: '长期记忆', desc: '偏好与标的下文持久化，跨对话继承' },
  { name: '盲盘训练', desc: '盖住代码与日期的历史对练，按 R 结算' },
  { name: '画布', desc: '免费最多 3 张，Pro 不限数量' },
];

const styles = stylex.create({
  paywall: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  title: {
    color: colors.textPrimary,
    fontSize: fontSizes.xl,
    fontWeight: 700,
  },
  tagline: {
    color: colors.textSecondary,
    fontSize: fontSizes.md,
    textWrap: 'balance',
  },
  features: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    margin: 0,
    padding: '12px 14px',
    listStyle: 'none',
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.md,
    borderStyle: 'solid',
    borderWidth: '1px',
  },
  feature: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  featureName: {
    color: colors.textPrimary,
    fontSize: fontSizes.base,
    fontWeight: 600,
  },
  featureDesc: {
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
  cta: {
    'display': 'flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'height': sizes.controlHeight,
    'color': '#000',
    'backgroundColor': colors.accent,
    'borderRadius': radii.default,
    'fontSize': fontSizes.base,
    'fontWeight': 600,
    'textDecoration': 'none',
    'transitionProperty': 'transform, opacity',
    'transitionDuration': '120ms',
    ':hover': {
      color: '#000',
      opacity: 0.9,
    },
    ':active': {
      transform: 'scale(0.96)',
    },
  },
  yearly: {
    'alignSelf': 'center',
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    'textDecoration': 'none',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  hint: {
    color: colors.textMuted,
    fontSize: fontSizes.sm,
    textWrap: 'pretty',
  },
  toggle: {
    'alignSelf': 'flex-start',
    'padding': '4px 0',
    'backgroundColor': 'transparent',
    'borderStyle': 'none',
    'borderWidth': 0,
    'color': colors.accent,
    'fontSize': fontSizes.sm,
    'cursor': 'pointer',
    ':hover': {
      textDecoration: 'underline',
    },
  },
  runtimeNotice: {
    marginBottom: '10px',
    padding: '8px 9px',
    borderLeftColor: colors.accent,
    borderLeftStyle: 'solid',
    borderLeftWidth: '2px',
    backgroundColor: colors.backgroundElement,
    color: colors.textSecondary,
    fontSize: fontSizes.sm,
  },
});

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
    <div {...stylex.props(styles.paywall)}>
      <div {...stylex.props(styles.hero)}>
        <div {...stylex.props(styles.title)}>Kansoku AI</div>
        <div {...stylex.props(styles.tagline)}>解锁 AI 辅助的交易复盘与研究</div>
      </div>
      <ul {...stylex.props(styles.features)}>
        {FEATURES.map((f) => (
          <li key={f.name} {...stylex.props(styles.feature)}>
            <span {...stylex.props(styles.featureName)}>{f.name}</span>
            <span {...stylex.props(styles.featureDesc)}>{f.desc}</span>
          </li>
        ))}
      </ul>
      {subscribe?.subscribeUrl ? (
        <a
          {...stylex.props(styles.cta)}
          href={subscribe.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {monthlyCtaLabel(subscribe)}
        </a>
      ) : null}
      {subscribe?.yearly ? (
        <a
          {...stylex.props(styles.yearly)}
          href={subscribe.yearly.subscribeUrl}
          target="_blank"
          rel="noreferrer"
        >
          {yearlyCtaLabel(subscribe.yearly)}
        </a>
      ) : null}
      <div {...stylex.props(styles.hint)}>
        {subscribe?.trialDays ? '试用期内不会扣款；' : ''}
        订阅后授权码发至邮箱，下方粘贴激活
      </div>
      {showActivate ? (
        <ActivateForm notice={notice} showSubscribeLink={false} onActivated={onActivated} />
      ) : (
        <button {...stylex.props(styles.toggle)} onClick={() => setShowActivate(true)}>
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
        <div {...stylex.props(styles.runtimeNotice)}>
          本次操作因授权已失效被拒绝，请重新验证或激活。
        </div>
      ) : null}
      {licensed ? <LicensePanel /> : <Paywall notice={notice} onActivated={close} />}
    </>
  );
}
