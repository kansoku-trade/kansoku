import { afterEach, describe, expect, it, vi } from 'vitest';

const createMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const listMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const getMock = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));

vi.mock('@desktop/cli/commands/chart/create.js', () => ({ runChartCreate: createMock }));
vi.mock('@desktop/cli/commands/chart/list.js', () => ({ runChartList: listMock }));
vi.mock('@desktop/cli/commands/chart/get.js', () => ({ runChartGet: getMock }));

const { runChart } = await import('@desktop/cli/commands/chart.js');

describe('runChart', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    createMock.mockClear();
    listMock.mockClear();
    getMock.mockClear();
  });

  it('dispatches "create" to runChartCreate with the remaining args', async () => {
    await runChart(['create', '--type', 'sepa', '--symbol', 'MRVL.US']);
    expect(createMock).toHaveBeenCalledWith(['--type', 'sepa', '--symbol', 'MRVL.US']);
  });

  it('dispatches "list" to runChartList with the remaining args', async () => {
    await runChart(['list', '--symbol', 'MRVL.US']);
    expect(listMock).toHaveBeenCalledWith(['--symbol', 'MRVL.US']);
  });

  it('dispatches "get" to runChartGet with the remaining args', async () => {
    await runChart(['get', 'foo']);
    expect(getMock).toHaveBeenCalledWith(['foo']);
  });

  it('writes to stderr and exits with 64 on an unknown sub-command', async () => {
    const errWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);

    await runChart(['bogus']);

    expect(errWrite).toHaveBeenCalledWith('chart: unknown sub-command "bogus"\n');
    expect(exit).toHaveBeenCalledWith(64);
  });
});
