import { CANVAS_DIR } from '../platform/env.js';
import { isLicensed } from '../license/licenseGate.js';
import { ClientError } from '../platform/errors.js';
import type { CanvasApi } from '../contract/canvas.js';
import { assertCanvasQuota } from './quotaEnforce.js';
import { listCanvases, loadCanvas, recordCanvasCheck, saveCanvas } from './store.js';

export function createCanvasService(
  dir: string,
  opts: { licensed?: () => boolean } = {},
): CanvasApi {
  const licensed = opts.licensed ?? isLicensed;
  return {
    async list() {
      return listCanvases(dir);
    },

    async get(input) {
      const doc = await loadCanvas(dir, input.slug);
      if (!doc) throw new ClientError(`canvas not found: ${input.slug}`, undefined, 404);
      return doc;
    },

    async save(input) {
      await assertCanvasQuota(dir, input.slug, licensed());
      const result = await saveCanvas(dir, input);
      if (!result.ok) throw new ClientError(result.issues.join('; '), undefined, 400);
      return result.doc;
    },

    async recordCheck(input) {
      const existing = await loadCanvas(dir, input.slug);
      if (!existing) throw new ClientError(`canvas not found: ${input.slug}`, undefined, 404);
      await recordCanvasCheck(dir, input.slug, {
        issues: input.issues,
        stage: input.stage,
      });
      const doc = await loadCanvas(dir, input.slug);
      if (!doc) throw new ClientError(`canvas not found: ${input.slug}`, undefined, 404);
      return doc;
    },
  };
}

export const canvasService = createCanvasService(CANVAS_DIR);
