import { type Static, Type } from "typebox";

export const episodeTradeReasonCategorySchema = Type.Union([
  Type.Literal("trend_following"),
  Type.Literal("breakout"),
  Type.Literal("pullback"),
  Type.Literal("mean_reversion"),
  Type.Literal("support_resistance"),
  Type.Literal("momentum"),
  Type.Literal("volume_flow"),
  Type.Literal("volatility"),
  Type.Literal("news_event"),
  Type.Literal("fundamental"),
  Type.Literal("risk_management"),
  Type.Literal("thesis_invalidated"),
  Type.Literal("profit_protection"),
  Type.Literal("time_horizon"),
  Type.Literal("no_setup"),
  Type.Literal("other"),
]);

export type EpisodeTradeReasonCategory = Static<typeof episodeTradeReasonCategorySchema>;

export const episodeTradeReasonSchema = Type.Object(
  {
    category: episodeTradeReasonCategorySchema,
    summary: Type.String({ minLength: 1, maxLength: 800 }),
  },
  { additionalProperties: false },
);

export type EpisodeTradeReason = Static<typeof episodeTradeReasonSchema>;
