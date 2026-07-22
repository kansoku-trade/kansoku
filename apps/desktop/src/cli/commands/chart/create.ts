import { readFileSync } from 'node:fs';
import type { ChartUrlDoc } from '@kansoku/shared/chartUrl';
import { emit } from '../../report.js';

interface CreateArgs {
  type?: string;
  symbol?: string;
  jsonInput?: string;
}

type CreateChartFn = (
  payload: Record<string, unknown>,
) => Promise<{ data: Record<string, unknown> }>;

function parseCreateArgs(argv: string[]): CreateArgs {
  const args: CreateArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--type') args.type = argv[++i];
    else if (argv[i] === '--symbol') args.symbol = argv[++i];
    else if (argv[i] === '--json-input') args.jsonInput = argv[++i];
  }
  return args;
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}

function fail(message: string): void {
  process.stderr.write(`${message}\n`);
  process.exit(64);
}

export async function runChartCreate(argv: string[], create?: CreateChartFn): Promise<void> {
  const args = parseCreateArgs(argv);
  if (!args.type) return fail('chart create: --type is required');
  if (!args.jsonInput) return fail('chart create: --json-input is required');

  let raw: string;
  try {
    raw = args.jsonInput === '-' ? await readStdin() : readFileSync(args.jsonInput, 'utf8');
  } catch (err) {
    return fail(
      `chart create: failed to read --json-input (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  let extra: Record<string, unknown>;
  try {
    const parsed: unknown = raw.trim() ? JSON.parse(raw) : {};
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
      throw new Error('--json-input must contain a JSON object');
    }
    extra = parsed as Record<string, unknown>;
  } catch (err) {
    return fail(
      `chart create: invalid --json-input (${err instanceof Error ? err.message : String(err)})`,
    );
  }

  const payload: Record<string, unknown> = { ...extra, type: args.type };
  if (args.symbol) payload.symbol = args.symbol;

  try {
    // Kernel modules resolve `journal/charts/data` etc. off `TRADE_PROJECT_ROOT` at
    // import time, so this import must stay dynamic and run after resolveDataRoot()
    // has already set the env var (see apps/desktop/src/boot/kernel.ts for the same
    // constraint on the Electron boot path).
    const createChart =
      create ?? (await import('@kansoku/core/charts/charts.service')).chartsService.create;
    const result = await createChart(payload);
    const { chartDeepLink } = await import('@kansoku/core/platform/chartUrl');
    emit({ ...result.data, deepLink: chartDeepLink(result.data as unknown as ChartUrlDoc) });
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}
