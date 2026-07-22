import { runChartCreate } from './chart/create.js';
import { runChartGet } from './chart/get.js';
import { runChartList } from './chart/list.js';

export { runChartCreate } from './chart/create.js';
export { runChartGet } from './chart/get.js';
export { runChartList } from './chart/list.js';

export async function runChart(argv: string[]): Promise<void> {
  const sub = argv[0];
  const rest = argv.slice(1);
  switch (sub) {
    case 'create': {
      return runChartCreate(rest);
    }
    case 'list': {
      return runChartList(rest);
    }
    case 'get': {
      return runChartGet(rest);
    }
    default: {
      process.stderr.write(`chart: unknown sub-command "${sub}"\n`);
      process.exit(64);
    }
  }
}
