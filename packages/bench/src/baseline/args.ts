import type { MockMode } from "../schema/mode.js";
import { BASELINE_STRATEGIES, type BaselineStrategy, isBaselineStrategy } from "./baselines.js";

function csv(value: string): string[] {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function two(value: number): string {
  return String(value).padStart(2, "0");
}

export function defaultRunId(now: Date = new Date()): string {
  const stamp =
    `${now.getFullYear()}${two(now.getMonth() + 1)}${two(now.getDate())}` +
    `-${two(now.getHours())}${two(now.getMinutes())}${two(now.getSeconds())}`;
  return `run-${stamp}`;
}

function parseModes(value: string): MockMode[] {
  const modes = csv(value);
  for (const mode of modes) {
    if (mode !== "blind" && mode !== "live") throw new Error(`invalid --mode: ${mode} (expected blind|live)`);
  }
  return modes as MockMode[];
}

function parseBank(value: string): "swing" | "intraday" {
  if (value !== "swing" && value !== "intraday") throw new Error(`invalid --bank: ${value} (expected swing|intraday)`);
  return value;
}

export interface ParsedBaselineArgs {
  strategies: BaselineStrategy[];
  bank: "swing" | "intraday";
  modes?: MockMode[];
  datasetVersion: string;
  runId: string;
  questionIds?: string[];
}

export function parseBaselineArgs(argv: string[], now: Date = new Date()): ParsedBaselineArgs {
  let strategies: BaselineStrategy[] = [...BASELINE_STRATEGIES];
  let bank: "swing" | "intraday" = "swing";
  let modes: MockMode[] | undefined;
  let datasetVersion: string | undefined;
  let runId: string | undefined;
  let questionIds: string[] | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--strategies":
        strategies = csv(argv[++i]).map((entry) => {
          if (!isBaselineStrategy(entry)) throw new Error(`invalid baseline strategy: ${entry}`);
          return entry;
        });
        break;
      case "--bank":
        bank = parseBank(argv[++i]);
        break;
      case "--mode":
      case "--modes":
        modes = parseModes(argv[++i]);
        break;
      case "--dataset-version":
        datasetVersion = argv[++i];
        break;
      case "--run-id":
        runId = argv[++i];
        break;
      case "--questions":
        questionIds = csv(argv[++i]);
        break;
      default:
        throw new Error(`unknown baseline option: ${arg}`);
    }
  }

  if (!datasetVersion) throw new Error("--dataset-version is required");
  if (strategies.length === 0) throw new Error("--strategies requires at least one strategy");

  return { strategies, bank, modes, datasetVersion, runId: runId ?? defaultRunId(now), questionIds };
}
