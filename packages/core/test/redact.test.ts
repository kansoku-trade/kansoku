import { describe, expect, it } from 'vitest';
import { redact } from '../src/platform/redact.js';

describe('redact', () => {
  it('redacts bare api-key shaped tokens', () => {
    expect(redact('用的是 sk-abc123def456ghi789jkl 这个 key')).not.toContain('sk-abc123');
    expect(redact('sk-abc123def456ghi789jkl')).toContain('[REDACTED]');
    expect(redact('ghp_abcdefghij1234567890KLMNOP')).toBe('[REDACTED]');
    expect(redact('AKIAIOSFODNN7EXAMPLE')).toBe('[REDACTED]');
    expect(redact('xoxb-1234567890-abcdefghijk')).toBe('[REDACTED]');
  });

  it('redacts JWTs and bearer credentials', () => {
    expect(
      redact('header eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N7flQ'),
    ).toBe('header [REDACTED]');
    expect(redact('Authorization: Bearer abcdef1234567890abcdef')).toContain('[REDACTED]');
  });

  it('keeps the label but redacts labeled secret values', () => {
    expect(redact('LONGPORT_ACCESS_TOKEN=abcdef1234567890')).toBe(
      'LONGPORT_ACCESS_TOKEN=[REDACTED]',
    );
    expect(redact('api_key: my-secret-value-123')).toBe('api_key: [REDACTED]');
    expect(redact('password = hunter2hunter2')).toBe('password = [REDACTED]');
  });

  it('redacts account numbers behind an account label', () => {
    expect(redact('账号: 123456789')).toBe('账号: [REDACTED]');
    expect(redact('account no. 987654321')).toContain('[REDACTED]');
  });

  it('leaves market prose, prices, and tickers untouched', () => {
    const prose =
      'MU 现价 $142.30，20日均线 $138；止损 97，target1 104（+4.0%）。SMH < $560 触发 B 线。' +
      '成交量 19,600,000 股，2026-07-22T14:30:00Z 快照。token 用量 5000。';
    expect(redact(prose)).toBe(prose);
  });

  it('is stable on already-redacted text', () => {
    const once = redact('api_key: my-secret-value-123');
    expect(redact(once)).toBe(once);
  });
});
