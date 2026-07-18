import { Type } from 'typebox';
import type { RawBar } from '@kansoku/shared/types';

export const barSchema = Type.Object(
  {
    time: Type.String(),
    open: Type.Union([Type.String(), Type.Number()]),
    high: Type.Union([Type.String(), Type.Number()]),
    low: Type.Union([Type.String(), Type.Number()]),
    close: Type.Union([Type.String(), Type.Number()]),
    volume: Type.Union([Type.String(), Type.Number()]),
  },
  { additionalProperties: false },
);

export type Bar = RawBar;
