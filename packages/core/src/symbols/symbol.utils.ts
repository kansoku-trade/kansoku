import { ClientError } from '../platform/errors.js';

const SYMBOL_RE = /^[\d.A-Z]+$/;
const NOTE_NAME_RE = /^[\d.A-Z_-]+$/;

export type Market = 'US' | 'HK' | 'CN';

export function marketOf(symbol: string): Market {
  const sym = symbol.trim().toUpperCase();
  if (sym.endsWith('.HK')) return 'HK';
  if (sym.endsWith('.SH') || sym.endsWith('.SZ')) return 'CN';
  return 'US';
}

export function normalizeSymbol(raw: string): string {
  let sym = raw.trim().toUpperCase();
  if (!sym.includes('.')) sym += '.US';
  if (!SYMBOL_RE.test(sym)) {
    throw new ClientError(`invalid symbol: ${raw}`, 'e.g. MU or MU.US');
  }
  return sym;
}

export function noteFileName(raw: string): string {
  const name = raw.trim().replace(/\.us$/i, '').toUpperCase();
  if (!NOTE_NAME_RE.test(name) || name.includes('..')) {
    throw new ClientError(`invalid symbol: ${raw}`, 'expected a plain ticker like MU or MU.US');
  }
  return name;
}
