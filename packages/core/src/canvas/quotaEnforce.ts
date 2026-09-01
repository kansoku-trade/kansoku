import { ClientError } from '../platform/errors.js';
import { canSaveCanvas, canvasQuotaMessage } from './quota.js';
import { listCanvases, loadCanvas } from './store.js';

export async function assertCanvasQuota(
  dir: string,
  slug: string,
  licensed: boolean,
): Promise<void> {
  const existing = await loadCanvas(dir, slug);
  const listed = await listCanvases(dir);
  if (canSaveCanvas({ licensed, replacing: Boolean(existing), count: listed.length })) return;
  throw new ClientError(canvasQuotaMessage(), undefined, 403, 'LICENSE_REQUIRED');
}
