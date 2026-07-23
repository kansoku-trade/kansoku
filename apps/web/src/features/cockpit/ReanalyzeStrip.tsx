import { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { SectionTitle } from '@web/ui';
import { AnalystRunFeed } from './AnalystRunFeed';
import { useAnalystRunStatus } from './analystRunsStore';

export function ReanalyzeStrip({ sym }: { sym: string }) {
  const status = useAnalystRunStatus(sym);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [sym]);

  if (!status) return null;

  return (
    <div className="reanalyze-strip">
      <SectionTitle className="reanalyze-strip-toggle" onClick={() => setExpanded((v) => !v)}>
        <span className="reanalyze-strip-label">AI 重新分析中…</span>
        <span className="reanalyze-strip-activity">{status.activity}</span>
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
