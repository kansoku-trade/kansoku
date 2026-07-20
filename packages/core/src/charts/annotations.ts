import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { Annotation } from '@kansoku/shared/types';
import { ANNOTATIONS_DIR } from '../platform/env.js';
import { ClientError } from '../platform/errors.js';

const SYMBOL_RE = /^[\d.A-Z\-]+$/;

function normalizeSymbol(symbol: string): string {
  const normalized = symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(normalized)) {
    throw new ClientError(
      `invalid symbol: ${symbol}`,
      "symbols may only contain letters, digits, '.' and '-'",
    );
  }
  return normalized;
}

function annotationPath(symbol: string): string {
  return join(ANNOTATIONS_DIR, `${normalizeSymbol(symbol)}.json`);
}

export interface AnnotationsChangedEvent {
  symbol: string;
  annotations: Annotation[];
  clientId?: string;
}

type Listener = (event: AnnotationsChangedEvent) => void;

const listeners = new Map<string, Set<Listener>>();

export function onAnnotationsChanged(symbol: string, listener: Listener): () => void {
  const normalized = normalizeSymbol(symbol);
  let set = listeners.get(normalized);
  if (!set) {
    set = new Set();
    listeners.set(normalized, set);
  }
  set.add(listener);
  return () => {
    const current = listeners.get(normalized);
    if (!current) return;
    current.delete(listener);
    if (current.size === 0) listeners.delete(normalized);
  };
}

function broadcast(event: AnnotationsChangedEvent): void {
  const set = listeners.get(event.symbol);
  if (!set) return;
  for (const listener of set) {
    try {
      listener(event);
    } catch {
      continue;
    }
  }
}

export async function loadAnnotations(symbol: string): Promise<Annotation[]> {
  const path = annotationPath(symbol);
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch (err) {
    if (err && typeof err === 'object' && 'code' in err && err.code === 'ENOENT') return [];
    throw err;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveAnnotations(
  symbol: string,
  annotations: Annotation[],
  clientId?: string,
): Promise<void> {
  const normalized = normalizeSymbol(symbol);
  const path = annotationPath(symbol);
  await fs.mkdir(ANNOTATIONS_DIR, { recursive: true });
  await fs.writeFile(path, JSON.stringify(annotations, null, 2));
  broadcast({ symbol: normalized, annotations, ...(clientId !== undefined ? { clientId } : {}) });
}
