import { z } from 'zod';
import { ANNOTATION_PALETTE } from '@kansoku/shared/drawings';
import type { Annotation, AnnotationKind } from '@kansoku/shared/types';
import { ClientError } from '../platform/errors.js';

const KINDS: [AnnotationKind, ...AnnotationKind[]] = [
  'trendline',
  'hline',
  'rect',
  'fib',
  'polyline',
];
const WIDTHS = [1, 2, 3] as const;

const pointSchema = z.object({
  time: z.number(),
  price: z.number(),
});

const styleSchema = z
  .object({
    color: z.string().optional(),
    width: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
    dash: z.boolean().optional(),
    arrow: z.boolean().optional(),
  })
  .loose();

const annotationObjectSchema = z
  .object({
    id: z.unknown(),
    kind: z.unknown(),
    points: z.unknown(),
    createdAt: z.unknown(),
    source: z.unknown().optional(),
    label: z.unknown().optional(),
    style: z.unknown().optional(),
  })
  .loose();

const kindSchema = z.enum(KINDS);
const pointsSchema = z.array(pointSchema);
export const annotationsArraySchema = z.array(z.unknown());

function annotationId(item: { id?: unknown }): string {
  return typeof item.id === 'string' ? item.id : '(missing id)';
}

function validateStyle(style: unknown, id: string): void {
  if (style === undefined) return;
  if (typeof style !== 'object' || style === null) {
    throw new ClientError(`annotation ${id}: style must be an object`);
  }
  const parsed = styleSchema.safeParse(style);
  if (!parsed.success) {
    const path = parsed.error.issues[0]?.path[0];
    if (path === 'dash') throw new ClientError(`annotation ${id}: style.dash must be a boolean`);
    if (path === 'arrow') throw new ClientError(`annotation ${id}: style.arrow must be a boolean`);
    if (path === 'width') throw new ClientError(`annotation ${id}: style.width must be 1, 2, or 3`);
    throw new ClientError(`annotation ${id}: style must be an object`);
  }
  if (parsed.data.color !== undefined && !ANNOTATION_PALETTE.includes(parsed.data.color)) {
    throw new ClientError(`annotation ${id}: style.color must be one of the preset palette`);
  }
  if (parsed.data.width !== undefined && !WIDTHS.includes(parsed.data.width)) {
    throw new ClientError(`annotation ${id}: style.width must be 1, 2, or 3`);
  }
}

function validateAnnotation(item: unknown): Annotation {
  const shape = annotationObjectSchema.safeParse(item);
  if (!shape.success) throw new ClientError('invalid annotation shape');
  const a = shape.data;
  const id = annotationId(a);
  if (typeof a.id !== 'string') throw new ClientError(`annotation ${id}: id must be a string`);
  const kindResult = kindSchema.safeParse(a.kind);
  if (!kindResult.success) {
    throw new ClientError(`annotation ${id}: kind must be one of ${KINDS.join(', ')}`);
  }
  const kind = kindResult.data;
  const pointsResult = pointsSchema.safeParse(a.points);
  if (!pointsResult.success) {
    throw new ClientError(`annotation ${id}: points must be {time, price} pairs`);
  }
  const points = pointsResult.data;
  if (kind === 'polyline') {
    if (points.length < 2 || points.length > 20) {
      throw new ClientError(`annotation ${id}: kind polyline needs 2 to 20 points`);
    }
  } else {
    const expectedPoints = kind === 'hline' ? 1 : 2;
    if (points.length !== expectedPoints) {
      throw new ClientError(`annotation ${id}: kind ${kind} needs ${expectedPoints} points`);
    }
  }
  if (typeof a.createdAt !== 'number') {
    throw new ClientError(`annotation ${id}: createdAt must be a number`);
  }
  if (a.label !== undefined && (typeof a.label !== 'string' || a.label.length > 120)) {
    throw new ClientError(`annotation ${id}: label must be a string of at most 120 characters`);
  }
  if (a.source !== undefined && a.source !== 'user' && a.source !== 'ai') {
    throw new ClientError(`annotation ${id}: source must be "user" or "ai"`);
  }
  validateStyle(a.style, id);
  return {
    id: a.id,
    kind,
    points,
    createdAt: a.createdAt,
    ...(typeof a.label === 'string' ? { label: a.label } : {}),
    ...(a.source === 'user' || a.source === 'ai' ? { source: a.source } : {}),
    ...(a.style !== undefined ? { style: a.style as Annotation['style'] } : {}),
  };
}

export function parseAnnotations(annotations: unknown): Annotation[] {
  const items = annotationsArraySchema.safeParse(annotations);
  if (!items.success) {
    throw new ClientError('`annotations` must be an array', 'e.g. {"annotations": []}');
  }
  return items.data.map(validateAnnotation);
}
