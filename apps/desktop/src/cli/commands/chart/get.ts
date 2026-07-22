import { emit } from '../../report.js';

export async function runChartGet(argv: string[]): Promise<void> {
  const id = argv[0];
  if (!id) {
    process.stderr.write('chart get: missing chart id\n');
    process.exit(64);
    return;
  }

  const { listCharts, loadChart } = await import('@kansoku/core/charts/store');
  const metas = await listCharts();
  const meta = metas.find((m) => m.id === id);
  if (!meta) {
    process.stderr.write(`chart get: not found: ${id}\n`);
    process.exit(1);
    return;
  }

  const data = await loadChart(id);
  if (!data) {
    process.stderr.write(`chart get: missing chart data for: ${id}\n`);
    process.exit(1);
    return;
  }

  emit({ meta, data });
}
