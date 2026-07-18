import { promises as fs } from "node:fs";
import { Type, type Static } from "typebox";
import { Value } from "typebox/value";

const DATE_PATTERN = "^\\d{4}-\\d{2}-\\d{2}$";
const DATASET_ID_PATTERN = "^[a-z0-9][a-z0-9-]*$";
const ALIAS_PATTERN = "^ASSET[0-9]{3}$";

export const episodeDatasetPlanSchema = Type.Object(
  {
    schemaVersion: Type.Literal(1),
    id: Type.String({ pattern: DATASET_ID_PATTERN }),
    cohort: Type.Union([Type.Literal("live-2026"), Type.Literal("blind-anonymous")]),
    horizonSessions: Type.Integer({ minimum: 5, maximum: 60 }),
    cases: Type.Array(
      Type.Object(
        {
          symbol: Type.String({ minLength: 3 }),
          cutoff: Type.String({ pattern: DATE_PATTERN }),
          alias: Type.Optional(Type.String({ pattern: ALIAS_PATTERN })),
          syntheticCutoff: Type.Optional(Type.String({ pattern: DATE_PATTERN })),
        },
        { additionalProperties: false },
      ),
      { minItems: 1 },
    ),
  },
  { additionalProperties: false },
);

export type EpisodeDatasetPlan = Static<typeof episodeDatasetPlanSchema>;
export type EpisodeDatasetPlanCase = EpisodeDatasetPlan["cases"][number];

export class EpisodeDatasetPlanError extends Error {}

function validDate(value: string): boolean {
  return !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function assertEpisodeDatasetPlan(value: unknown): EpisodeDatasetPlan {
  if (!Value.Check(episodeDatasetPlanSchema, value)) {
    const first = Value.Errors(episodeDatasetPlanSchema, value)[0];
    throw new EpisodeDatasetPlanError(
      `invalid episode dataset plan: ${first?.instancePath || "(root)"} ${first?.message ?? "schema mismatch"}`,
    );
  }
  const plan = value;
  const aliases = new Set<string>();
  const outputs = new Set<string>();
  for (const entry of plan.cases) {
    if (!validDate(entry.cutoff)) throw new EpisodeDatasetPlanError(`invalid cutoff date: ${entry.cutoff}`);
    if (plan.cohort === "live-2026") {
      if (!entry.cutoff.startsWith("2026-")) {
        throw new EpisodeDatasetPlanError(`live-2026 cutoff must be in 2026: ${entry.symbol} ${entry.cutoff}`);
      }
      if (entry.alias || entry.syntheticCutoff) {
        throw new EpisodeDatasetPlanError("live-2026 cases must not define alias or syntheticCutoff");
      }
    } else {
      if (!entry.alias || !entry.syntheticCutoff) {
        throw new EpisodeDatasetPlanError(
          `blind-anonymous case requires alias and syntheticCutoff: ${entry.symbol} ${entry.cutoff}`,
        );
      }
      if (!validDate(entry.syntheticCutoff)) {
        throw new EpisodeDatasetPlanError(`invalid synthetic cutoff date: ${entry.syntheticCutoff}`);
      }
      if (!entry.syntheticCutoff.startsWith("2026-")) {
        throw new EpisodeDatasetPlanError(`blind synthetic cutoff must be in 2026: ${entry.syntheticCutoff}`);
      }
      if (new Date(`${entry.cutoff}T00:00:00Z`).getUTCDay()
        !== new Date(`${entry.syntheticCutoff}T00:00:00Z`).getUTCDay()) {
        throw new EpisodeDatasetPlanError(
          `blind source and synthetic cutoffs must share a weekday: ${entry.cutoff}/${entry.syntheticCutoff}`,
        );
      }
      if (aliases.has(entry.alias)) throw new EpisodeDatasetPlanError(`duplicate blind alias: ${entry.alias}`);
      aliases.add(entry.alias);
    }

    const outputKey = plan.cohort === "live-2026"
      ? `${entry.symbol}:${entry.cutoff}`
      : `${entry.alias}:${entry.syntheticCutoff}`;
    if (outputs.has(outputKey)) throw new EpisodeDatasetPlanError(`duplicate output case: ${outputKey}`);
    outputs.add(outputKey);
  }
  return plan;
}

export async function loadEpisodeDatasetPlan(file: string): Promise<EpisodeDatasetPlan> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await fs.readFile(file, "utf8")) as unknown;
  } catch (error) {
    throw new EpisodeDatasetPlanError(
      `unable to read episode dataset plan ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  return assertEpisodeDatasetPlan(parsed);
}
