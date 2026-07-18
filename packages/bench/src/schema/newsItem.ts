import { Type } from 'typebox';
import type { NewsItem } from '@kansoku/shared/types';

export const newsItemSchema = Type.Object(
  {
    id: Type.String(),
    title: Type.String(),
    published_at: Type.String(),
    url: Type.String(),
    source: Type.Optional(Type.String()),
  },
  { additionalProperties: false },
);

export type BenchNewsItem = NewsItem & { source?: string };
