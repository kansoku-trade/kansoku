import { createHash } from 'node:crypto';
import type { AiProvenance } from '@kansoku/shared/types';
import type { AiModel } from './models.js';

export function promptVersionOf(...parts: string[]): string {
  const hash = createHash('sha256');
  for (const part of parts) {
    hash.update(String(part.length));
    hash.update('\0');
    hash.update(part);
  }
  return hash.digest('hex').slice(0, 12);
}

export function buildProvenance(model: AiModel, ...promptParts: string[]): AiProvenance {
  const ref = model as { provider?: string; id?: string };
  return {
    provider: ref.provider ?? 'unknown',
    model: ref.id ?? 'unknown',
    promptVersion: promptVersionOf(...promptParts),
  };
}
