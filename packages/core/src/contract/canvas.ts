import { defineRoutes } from './defineRoutes.js';

export interface CanvasMeta {
  slug: string;
  title: string;
  mtime: string;
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
}

export interface CanvasApi {
  list(): Promise<CanvasMeta[]>;
  get(input: { slug: string }): Promise<CanvasDoc>;
  save(input: { slug: string; title: string; source: string }): Promise<CanvasDoc>;
  recordCheck(input: {
    slug: string;
    issues: string[];
    stage: 'compile' | 'runtime';
  }): Promise<CanvasDoc>;
}

export const canvasRoutes = defineRoutes<CanvasApi>('canvas', {
  list: { method: 'GET', path: '/' },
  get: { method: 'GET', path: '/:slug' },
  save: { method: 'PUT', path: '/:slug' },
  recordCheck: { method: 'POST', path: '/:slug/check' },
});
