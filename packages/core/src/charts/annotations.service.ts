import { ANNOTATION_PALETTE } from '@kansoku/shared/drawings';
import type {
  Annotation,
  AnnotationKind,
  AnnotationPoint,
  AnnotationStyle,
} from '@kansoku/shared/types';
import type { AnnotationsApi } from '../contract/annotations.js';
import { ClientError } from '../platform/errors.js';
import { loadAnnotations, saveAnnotations } from './annotations.js';

const KINDS: AnnotationKind[] = ['trendline', 'hline', 'rect', 'fib', 'polyline'];
const SOURCES = ['user', 'ai'];
const WIDTHS = [1, 2, 3];

function isValidPoint(point: unknown): point is AnnotationPoint {
  return (
    typeof point === 'object' &&
    point !== null &&
    typeof (point as AnnotationPoint).time === 'number' &&
    typeof (point as AnnotationPoint).price === 'number'
  );
}

function validateStyle(style: AnnotationStyle | undefined, id: string): void {
  if (style === undefined) return;
  if (typeof style !== 'object' || style === null) {
    throw new ClientError(`annotation ${id}: style must be an object`);
  }
  if (style.color !== undefined && !ANNOTATION_PALETTE.includes(style.color)) {
    throw new ClientError(`annotation ${id}: style.color must be one of the preset palette`);
  }
  if (style.width !== undefined && !WIDTHS.includes(style.width)) {
    throw new ClientError(`annotation ${id}: style.width must be 1, 2, or 3`);
  }
  if (style.dash !== undefined && typeof style.dash !== 'boolean') {
    throw new ClientError(`annotation ${id}: style.dash must be a boolean`);
  }
  if (style.arrow !== undefined && typeof style.arrow !== 'boolean') {
    throw new ClientError(`annotation ${id}: style.arrow must be a boolean`);
  }
}

function validateAnnotation(item: unknown): asserts item is Annotation {
  if (typeof item !== 'object' || item === null) {
    throw new ClientError('invalid annotation shape');
  }
  const a = item as Annotation;
  const id = typeof a.id === 'string' ? a.id : '(missing id)';
  if (typeof a.id !== 'string') throw new ClientError(`annotation ${id}: id must be a string`);
  if (!KINDS.includes(a.kind))
    throw new ClientError(`annotation ${id}: kind must be one of ${KINDS.join(', ')}`);
  if (!Array.isArray(a.points) || !a.points.every(isValidPoint)) {
    throw new ClientError(`annotation ${id}: points must be {time, price} pairs`);
  }
  if (a.kind === 'polyline') {
    if (a.points.length < 2 || a.points.length > 20) {
      throw new ClientError(`annotation ${id}: kind polyline needs 2 to 20 points`);
    }
  } else {
    const expectedPoints = a.kind === 'hline' ? 1 : 2;
    if (a.points.length !== expectedPoints) {
      throw new ClientError(`annotation ${id}: kind ${a.kind} needs ${expectedPoints} points`);
    }
  }
  if (typeof a.createdAt !== 'number')
    throw new ClientError(`annotation ${id}: createdAt must be a number`);
  if (a.label !== undefined && (typeof a.label !== 'string' || a.label.length > 120)) {
    throw new ClientError(`annotation ${id}: label must be a string of at most 120 characters`);
  }
  if (a.source !== undefined && !SOURCES.includes(a.source)) {
    throw new ClientError(`annotation ${id}: source must be "user" or "ai"`);
  }
  validateStyle(a.style, id);
}

function parseAnnotations(annotations: unknown): Annotation[] {
  if (!Array.isArray(annotations)) {
    throw new ClientError('`annotations` must be an array', 'e.g. {"annotations": []}');
  }
  annotations.forEach(validateAnnotation);
  return annotations;
}

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
