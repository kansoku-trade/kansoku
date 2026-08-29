import { useEffect, useState } from 'react';
import * as stylex from '@stylexjs/stylex';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SectionTitle } from '@web/ui';
import { colors, radii } from '../../theme/tokens.stylex';
import { AnalystRunFeed } from './AnalystRunFeed';
import { useAnalystRunStatus } from './analystRunsStore';

const styles = stylex.create({
  root: {
    backgroundColor: colors.backgroundSurface,
    borderColor: colors.border,
    borderRadius: radii.default,
    borderStyle: 'solid',
    borderWidth: '1px',
    marginBottom: '12px',
    padding: '8px 10px',
  },
  toggle: {
    alignItems: 'center',
    cursor: 'pointer',
    display: 'flex',
    gap: '8px',
    marginTop: 0,
    userSelect: 'none',
  },
  label: {
    color: colors.textPrimary,
    flex: '0 0 auto',
    fontWeight: 600,
  },
  activity: {
    color: colors.textSecondary,
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
});

export function ReanalyzeStrip({ sym }: { sym: string }) {
  const status = useAnalystRunStatus(sym);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [sym]);

  if (!status) return null;

  return (
    <div className={`reanalyze-strip ${stylex.props(styles.root).className}`}>
      <SectionTitle
        className={`reanalyze-strip-toggle ${stylex.props(styles.toggle).className}`}
        onClick={() => setExpanded((v) => !v)}
      >
        <span {...stylex.props(styles.label)}>AI 重新分析中…</span>
        <span {...stylex.props(styles.activity)}>{status.activity}</span>
        {expanded ? (
          <ChevronDown className="icon" size={13} />
        ) : (
          <ChevronRight className="icon" size={13} />
        )}
      </SectionTitle>
      {expanded && <AnalystRunFeed sym={sym} />}
    </div>
  );
}
