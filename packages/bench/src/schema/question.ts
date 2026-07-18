import { type Static, Type } from 'typebox';
import { barSchema } from './bar.js';
import { newsItemSchema } from './newsItem.js';

const ISO_DATETIME_PATTERN =
  '^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d+)?(Z|[+-]\\d{2}:\\d{2})$';

const jsonRecordSchema = Type.Record(Type.String(), Type.Unknown());

const replayRollupSchema = Type.Object(
  {
    availableAt: Type.String({ pattern: ISO_DATETIME_PATTERN }),
    bar: barSchema,
  },
  { additionalProperties: false },
);

const fixturesSchema = Type.Object(
  {
    kline: Type.Record(Type.String(), Type.Array(barSchema)),
    indicators: jsonRecordSchema,
    quote: jsonRecordSchema,
    capitalFlow: jsonRecordSchema,
    news: Type.Array(newsItemSchema),
    fundamentals: jsonRecordSchema,
    calendar: jsonRecordSchema,
  },
  { additionalProperties: false },
);

const replaySchema = Type.Object(
  {
    basePeriod: Type.Optional(Type.Union([Type.Literal('1h'), Type.Literal('day')])),
    decisionExpiryBars: Type.Optional(Type.Integer({ minimum: 1 })),
    entryExpiryBars: Type.Optional(Type.Integer({ minimum: 1 })),
    horizonSessions: Type.Optional(Type.Integer({ minimum: 1 })),
    horizonBars: Type.Integer({ minimum: 1 }),
    bars: Type.Array(barSchema),
    rollups: Type.Optional(
      Type.Object(
        {
          day: Type.Array(replayRollupSchema),
          week: Type.Array(replayRollupSchema),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { additionalProperties: false },
);

export const questionSchema = Type.Object(
  {
    id: Type.String(),
    bank: Type.Union([Type.Literal('swing'), Type.Literal('intraday')]),
    symbol: Type.String(),
    cutoff: Type.String({ pattern: ISO_DATETIME_PATTERN }),
    layer: Type.String(),
    adversarial: Type.Boolean(),
    fixtures: fixturesSchema,
    replay: replaySchema,
  },
  { additionalProperties: false },
);

export type Question = Static<typeof questionSchema>;

export type RunnerQuestion = Omit<Question, 'replay'>;
