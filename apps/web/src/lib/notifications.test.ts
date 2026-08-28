import { describe, expect, it } from 'vitest';
import type { Notice } from '@kansoku/shared/types';
import { decideNotification, type NotifyEnvelope } from './notifications';

const alert: NotifyEnvelope = {
  type: 'comment',
  live: true,
  symbol: 'MU.US',
  level: 'alert',
  text: '触及止损',
};

const notice: Notice = {
  symbol: 'MU.US',
  kind: 'analysis_done',
  title: 'MU.US AI 分析完成',
  body: 'done',
  at: '2026-07-14T10:00:00.000Z',
};

describe('background AI notifications', () => {
  it('notifies for an alert when the app is hidden', () => {
    expect(
      decideNotification(alert, { hidden: true, permission: 'granted', activeSymbol: 'MU.US' }),
    ).toEqual({
      title: 'MU.US 盘中警报',
      body: '触及止损',
    });
  });

  it('suppresses a duplicate notification while the same symbol is visible', () => {
    expect(
      decideNotification(alert, { hidden: false, permission: 'granted', activeSymbol: 'MU.US' }),
    ).toBeNull();
  });

  it('notifies after the symbol chart has been closed or another symbol is visible', () => {
    expect(
      decideNotification(alert, { hidden: false, permission: 'granted', activeSymbol: null }),
    ).not.toBeNull();
    expect(
      decideNotification(alert, { hidden: false, permission: 'granted', activeSymbol: 'NVDA.US' }),
    ).not.toBeNull();
  });

  it('keeps routine info and warn comments silent', () => {
    expect(
      decideNotification(
        { ...alert, level: 'warn' },
        { hidden: true, permission: 'granted', activeSymbol: null },
      ),
    ).toBeNull();
  });

  it('delivers completion notices after navigating away from the symbol', () => {
    expect(
      decideNotification(
        { type: 'notice', live: true, notice },
        { hidden: false, permission: 'granted', activeSymbol: null },
      ),
    ).toEqual({ title: notice.title, body: notice.body });
  });
});

const criticalEvent: NotifyEnvelope = {
  type: 'event',
  live: true,
  id: 'evt-1',
  title: 'Micron 提交 8-K',
  body: '公司披露一份新的供货协议',
  symbols: ['MU.US'],
  severity: 'critical',
};

describe('critical market-event notifications', () => {
  it('notifies for a live critical event when the app is hidden', () => {
    expect(
      decideNotification(criticalEvent, {
        hidden: true,
        permission: 'granted',
        activeSymbol: 'MU.US',
      }),
    ).toEqual({ title: 'MU 重大事件', body: 'Micron 提交 8-K' });
  });

  it('suppresses the same-symbol critical event while that cockpit is visible', () => {
    expect(
      decideNotification(criticalEvent, {
        hidden: false,
        permission: 'granted',
        activeSymbol: 'MU.US',
      }),
    ).toBeNull();
  });

  it('notifies a critical event for another name, or from the home page', () => {
    expect(
      decideNotification(criticalEvent, {
        hidden: false,
        permission: 'granted',
        activeSymbol: 'NVDA.US',
      }),
    ).not.toBeNull();
    expect(
      decideNotification(criticalEvent, {
        hidden: false,
        permission: 'granted',
        activeSymbol: null,
      }),
    ).not.toBeNull();
  });

  it('keeps info and notable events silent', () => {
    expect(
      decideNotification(
        { ...criticalEvent, severity: 'notable' },
        { hidden: true, permission: 'granted', activeSymbol: null },
      ),
    ).toBeNull();
    expect(
      decideNotification(
        { ...criticalEvent, severity: 'info' },
        { hidden: true, permission: 'granted', activeSymbol: null },
      ),
    ).toBeNull();
  });
});
