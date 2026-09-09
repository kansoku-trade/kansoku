import { defineRoutes } from './defineRoutes.js';

export interface CanvasOrigin {
  eventId: string;
  clusterId: string;
}

export interface CanvasMeta {
  slug: string;
  title: string;
  mtime: string;
  origin?: CanvasOrigin | null;
}

export interface CanvasCheckRecord {
  issues: string[];
  stage: 'static' | 'compile' | 'runtime';
  updatedAt: string;
}

export interface CanvasDoc {
  slug: string;
  title: string;
  source: string;
  mtime: string;
  check: CanvasCheckRecord | null;
  origin?: CanvasOrigin | null;
  data: Record<string, unknown>;
}

export type CanvasCompileResult =
  | { ok: true; code: string }
  | { ok: false; issues: string[] };

export interface CanvasApi {
  list(): Promise<CanvasMeta[]>;
  get(input: { slug: string }): Promise<CanvasDoc>;
  save(input: { slug: string; title: string; source: string }): Promise<CanvasDoc>;
  compile(input: { source: string }): Promise<CanvasCompileResult>;
  recordCheck(input: {
    slug: string;
    issues: string[];
    stage: 'compile' | 'runtime';
  }): Promise<CanvasDoc>;
}

export const canvasRoutes = defineRoutes<CanvasApi>('canvas', {
  list: { method: 'GET', path: '/' },
  compile: { method: 'POST', path: '/compile' },
  get: { method: 'GET', path: '/:slug' },
  save: { method: 'PUT', path: '/:slug' },
  recordCheck: { method: 'POST', path: '/:slug/check' },
});
