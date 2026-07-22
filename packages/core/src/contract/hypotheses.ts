import { defineRoutes } from './defineRoutes.js';
import type { Hypothesis, HypothesisRunCard, HypothesisStatus } from '@kansoku/shared/types';

export interface HypothesesApi {
  list(): Promise<Hypothesis[]>;
  create(input: {
    thesis: string;
    symbol?: string;
    invalidation_notes: string[];
  }): Promise<Hypothesis>;
  setStatus(input: { id: string; status: HypothesisStatus }): Promise<Hypothesis>;
  addRunCard(input: { id: string } & Omit<HypothesisRunCard, 'at'>): Promise<Hypothesis>;
}

export const hypothesesRoutes = defineRoutes<HypothesesApi>('hypotheses', {
  list: { method: 'GET', path: '/' },
  create: { method: 'POST', path: '/' },
  setStatus: { method: 'POST', path: '/:id/status' },
  addRunCard: { method: 'POST', path: '/:id/run-cards' },
});
