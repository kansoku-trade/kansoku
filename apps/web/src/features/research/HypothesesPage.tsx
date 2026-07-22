import { useState } from 'react';
import type { Hypothesis, HypothesisStatus } from '@kansoku/shared/types';
import { errorMessage } from '@web/lib/api';
import { useQuery } from '@web/lib/apiHooks';
import { client } from '@web/lib/client';
import { Badge, Button, Card, Empty, ErrorBox, Input, MarketTime, SectionTitle, Spinner } from '@web/ui';

const STATUS_LABEL: Record<HypothesisStatus, string> = {
  active: '进行中',
  confirmed: '已验证',
  invalidated: '已证伪',
  retired: '已搁置',
};
const STATUS_TONE: Record<HypothesisStatus, 'up' | 'down' | 'accent' | 'muted'> = {
  active: 'accent',
  confirmed: 'up',
  invalidated: 'down',
  retired: 'muted',
};
const CARD_KIND_LABEL: Record<string, string> = {
  prediction: '预测',
  trade_gate: '交易关卡',
  note: '备注',
};
const OUTCOME_LABEL: Record<string, string> = { support: '支持', against: '相悖', open: '待定' };

function HypothesisCard({
  hypothesis,
  onChanged,
}: {
  hypothesis: Hypothesis;
  onChanged: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const transition = async (status: HypothesisStatus) => {
    setError(null);
    try {
      await client.hypotheses.setStatus({ id: hypothesis.id, status });
      onChanged();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Card className="hypothesis-card">
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <Badge tone={STATUS_TONE[hypothesis.status]}>{STATUS_LABEL[hypothesis.status]}</Badge>
        {hypothesis.symbol && <Badge tone="muted">{hypothesis.symbol}</Badge>}
        <strong>{hypothesis.thesis}</strong>
      </div>
      <div style={{ marginTop: 6 }}>
        <div className="section-subtitle">证伪条件</div>
        <ul style={{ margin: '4px 0 0 18px', padding: 0 }}>
          {hypothesis.invalidation_notes.map((note, i) => (
            <li key={i}>{note}</li>
          ))}
        </ul>
      </div>
      {hypothesis.run_cards.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div className="section-subtitle">对账卡（{hypothesis.run_cards.length}）</div>
          {hypothesis.run_cards.map((card, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <MarketTime value={card.at} format="clock" />
              <Badge tone="muted">{CARD_KIND_LABEL[card.kind] ?? card.kind}</Badge>
              <span>{card.summary}</span>
              {card.outcome && <Badge tone={card.outcome === 'against' ? 'down' : card.outcome === 'support' ? 'up' : undefined}>{OUTCOME_LABEL[card.outcome]}</Badge>}
            </div>
          ))}
        </div>
      )}
      {hypothesis.status === 'active' && (
        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <Button onClick={() => transition('confirmed')}>标记已验证</Button>
          <Button onClick={() => transition('invalidated')}>标记已证伪</Button>
          <Button onClick={() => transition('retired')}>搁置</Button>
        </div>
      )}
      {error && <ErrorBox>{error}</ErrorBox>}
    </Card>
  );
}

function CreateForm({ onCreated }: { onCreated: () => void }) {
  const [thesis, setThesis] = useState('');
  const [symbol, setSymbol] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      await client.hypotheses.create({
        thesis,
        ...(symbol.trim() ? { symbol: symbol.trim().toUpperCase() } : {}),
        invalidation_notes: notes.split('\n'),
      });
      setThesis('');
      setSymbol('');
      setNotes('');
      onCreated();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <SectionTitle>新建假设</SectionTitle>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 6 }}>
        <Input
          placeholder="论点：这只票为什么会涨/跌（一句话）"
          value={thesis}
          onChange={(e) => setThesis(e.target.value)}
        />
        <Input
          placeholder="标的（可选，如 MU.US）"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
        />
        <textarea
          className="input"
          rows={3}
          placeholder="证伪条件（必填，一行一条）：什么情况发生就算这个论点错了"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
        <div>
          <Button accent state={busy ? 'busy' : undefined} disabled={busy} onClick={submit}>
            登记
          </Button>
        </div>
        {error && <ErrorBox>{error}</ErrorBox>}
      </div>
    </Card>
  );
}

export function HypothesesPage() {
  const { data, error, loading, reload } = useQuery<Hypothesis[]>('hypotheses.list', () =>
    client.hypotheses.list(),
  );

  return (
    <div className="page" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <h1 style={{ margin: 0 }}>我的假设</h1>
        <a href="/research">← 返回研究库</a>
      </div>
      <CreateForm onCreated={reload} />
      {loading && !data && <Spinner />}
      {error && <ErrorBox>{error}</ErrorBox>}
      {data && data.length === 0 && <Empty>还没有登记任何假设</Empty>}
      {data?.map((hypothesis) => (
        <HypothesisCard key={hypothesis.id} hypothesis={hypothesis} onChanged={reload} />
      ))}
    </div>
  );
}
