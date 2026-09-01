import type { Annotation } from '@kansoku/shared/types';
import type { AnnotationsApi } from '../contract/annotations.js';
import { parseAnnotations } from './annotations.input.js';
import { loadAnnotations, saveAnnotations } from './annotations.js';

export const annotationsService: AnnotationsApi = {
  async list(input) {
    return loadAnnotations(input.symbol);
  },

  async replace(input) {
    const annotations = parseAnnotations(input.annotations);
    await saveAnnotations(input.symbol, annotations, input.clientId);
    return { count: annotations.length };
  },
};

export type { Annotation };
