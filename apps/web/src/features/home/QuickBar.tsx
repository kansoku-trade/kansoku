import { useState } from 'react';
import { Library, MessageCircle, Settings, Sparkles } from 'lucide-react';
import * as stylex from '@stylexjs/stylex';
import { useCapabilities } from '@web/features/edition/capabilitiesStore';
import { openLicenseModal } from '@web/features/edition/licenseModalStore';
import { normalizeSymbol } from '@web/lib/symbol';
import { navigate } from '@web/lib/router';
import { listRecentSymbols } from '@web/features/charts/recentCharts';
import { colors, fontSizes, radii } from '../../theme/tokens.stylex';
import { Chip, Input } from '@web/ui';

const styles = stylex.create({
  root: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '8px',
    margin: '4px 0 20px',
  },
  input: {
    width: '170px',
  },
  recent: {
    fontSize: fontSizes.base,
    color: colors.textMuted,
    display: 'flex',
    gap: '8px',
    alignItems: 'center',
  },
  recentLink: {
    'color': colors.textSecondary,
    'textDecoration': 'none',
    ':hover': {
      color: colors.accent,
    },
  },
  actions: {
    marginLeft: 'auto',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '8px',
  },
  action: {
    'display': 'inline-flex',
    'alignItems': 'center',
    'justifyContent': 'center',
    'width': '26px',
    'height': '26px',
    'color': colors.textSecondary,
    'border': 'none',
    'background': 'none',
    'padding': '0',
    'font': 'inherit',
    'cursor': 'pointer',
    'borderRadius': radii.default,
    'textDecoration': 'none',
    ':hover': {
      color: colors.textPrimary,
      backgroundColor: colors.backgroundHover,
    },
  },
  trial: {
    'color': colors.accent,
    ':hover': {
      color: colors.accent,
    },
  },
});

export function QuickBar({
  shortcuts,
  showGlobalActions = true,
}: {
  shortcuts: string[];
  showGlobalActions?: boolean;
}) {
  const [input, setInput] = useState('');
  const { pro, licensed } = useCapabilities();
  const shortcutSet = new Set(shortcuts);
  const recent = listRecentSymbols().filter((s) => !shortcutSet.has(s.symbol));

  const go = () => {
    const sym = normalizeSymbol(input);
    if (!sym) return;
    setInput('');
    navigate(`/symbol/${encodeURIComponent(sym)}`);
  };

  return (
    <div className={`quickbar ${stylex.props(styles.root).className}`}>
      <Input
        className={stylex.props(styles.input).className}
        placeholder="代码直达，如 MRVL"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') go();
        }}
      />
      {shortcuts.map((sym) => (
        <Chip key={sym} href={`/symbol/${encodeURIComponent(sym)}`}>
          {sym.replace(/\.US$/, '')}
        </Chip>
      ))}
      {recent.length > 0 && (
        <span className={stylex.props(styles.recent).className}>
          最近：
          {recent.map((s) => (
            <a
              key={s.symbol}
              href={`/symbol/${encodeURIComponent(s.symbol)}`}
              {...stylex.props(styles.recentLink)}
            >
              {s.symbol.replace(/\.US$/, '')}
            </a>
          ))}
        </span>
      )}
      {showGlobalActions ? (
        <span className={`quickbar-actions ${stylex.props(styles.actions).className}`}>
          {pro && !licensed ? (
            <button
              type="button"
              {...stylex.props(styles.action, styles.trial)}
              aria-label="Kansoku AI"
              title="Kansoku AI · 免费试用 7 天"
              onClick={() => openLicenseModal('guard')}
            >
              <Sparkles size={16} />
            </button>
          ) : null}
          <a
            {...stylex.props(styles.action)}
            href="/research?view=journal"
            aria-label="研究库"
            title="研究库"
          >
            <Library size={16} />
          </a>
          <a {...stylex.props(styles.action)} href="/chat" aria-label="AI 对话" title="AI 对话">
            <MessageCircle size={16} />
          </a>
          <a {...stylex.props(styles.action)} href="/settings/ai" aria-label="设置" title="设置">
            <Settings size={16} />
          </a>
        </span>
      ) : null}
    </div>
  );
}
