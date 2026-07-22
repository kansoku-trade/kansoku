import { marketDate } from '@kansoku/shared/time';
import { emit } from '../../report.js';

interface ListArgs {
  symbol?: string;
  date?: string;
}

function parseListArgs(argv: string[]): ListArgs {
  const args: ListArgs = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--symbol') args.symbol = argv[++i];
    else if (argv[i] === '--date') args.date = argv[++i];
  }
  return args;
}

export async function runChartList(argv: string[]): Promise<void> {
  const args = parseListArgs(argv);
  const { listCharts } = await import('@kansoku/core/charts/store');
  const metas = await listCharts({ symbol: args.symbol });
  const filtered = args.date
    ? metas.filter((m) => marketDate(m.created_at) === args.date)
    : metas;
  emit(filtered);
}
