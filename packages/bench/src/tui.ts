import { spawn } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as p from '@clack/prompts';
import { getBuiltinModels, getBuiltinProviders } from '@earendil-works/pi-ai/providers/all';

interface FlagSpec {
  flag: string;
  placeholder?: string;
  hint?: string;
  boolean?: boolean;
  picker?: 'models' | 'dataset' | 'questions';
}

type Target = 'bench' | 'pro';

interface CommandSpec {
  id: string;
  title: string;
  description: string;
  target: Target;
  required: FlagSpec[];
  optional?: FlagSpec[];
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BENCH_PACKAGE_ROOT = path.dirname(HERE);
const KANSOKU_ROOT = path.dirname(path.dirname(BENCH_PACKAGE_ROOT));
const PRO_APP_DIR = path.join(KANSOKU_ROOT, 'apps', 'pro');

const COMMANDS: CommandSpec[] = [
  {
    id: 'sync-dataset',
    title: 'sync-dataset',
    description: '下载并校验不可变数据集 Release',
    target: 'bench',
    required: [{ flag: '--dataset-version', picker: 'dataset' }],
  },
  {
    id: 'baseline',
    title: 'baseline',
    description: '生成机械答卷（买入持有 / 抛硬币 / 永远观望）',
    target: 'bench',
    required: [{ flag: '--dataset-version', picker: 'dataset' }],
    optional: [
      { flag: '--bank', hint: 'swing (default)' },
      { flag: '--mode', hint: 'blind,live' },
      { flag: '--run-id', hint: 'run-<timestamp> (default)' },
      { flag: '--strategies', hint: 'buy-hold,coin-flip,always-neutral' },
    ],
  },
  {
    id: 'score',
    title: 'score',
    description: '把 predictions.jsonl 判成 scores.json',
    target: 'bench',
    required: [
      { flag: '--run-id', placeholder: 'run-2026-07-20' },
      { flag: '--dataset-version', picker: 'dataset' },
    ],
    optional: [{ flag: '--bank', hint: 'swing (default)' }],
  },
  {
    id: 'gold',
    title: 'gold',
    description: '生成事后最优答卷（判分器自检）',
    target: 'bench',
    required: [{ flag: '--dataset-version', picker: 'dataset' }],
    optional: [
      { flag: '--bank', hint: 'swing (default)' },
      { flag: '--check', hint: '校验判分器输出', boolean: true },
    ],
  },
  {
    id: 'report',
    title: 'report',
    description: '出 leaderboard 报告',
    target: 'bench',
    required: [{ flag: '--run-id', placeholder: 'run-2026-07-20' }],
    optional: [{ flag: '--format', hint: 'md | html | both (default md)' }],
  },
  {
    id: 'generate',
    title: 'generate (staging)',
    description: '生成待发布题库',
    target: 'bench',
    required: [{ flag: '--version', placeholder: 'v-next' }],
    optional: [
      { flag: '--windows-per-symbol', hint: '3 (default)' },
      { flag: '--symbols', hint: 'AAPL,NVDA' },
      { flag: '--dataset-dir', hint: '仅 staging 使用' },
      { flag: '--dry-run', hint: '不落盘', boolean: true },
      { flag: '--fresh', hint: '绕过源数据缓存', boolean: true },
    ],
  },
  {
    id: 'run',
    title: 'run (→ apps/pro)',
    description: '驱动模型跑基准（走私有 @kansoku/pro）',
    target: 'pro',
    required: [
      { flag: '--models', picker: 'models' },
      { flag: '--dataset-version', picker: 'dataset' },
    ],
    optional: [
      { flag: '--bank', hint: 'swing (default)' },
      { flag: '--mode', hint: 'blind (default) / blind,live' },
      { flag: '--repeat', hint: '1 (default)' },
      { flag: '--run-id', hint: 'run-<timestamp> (default)' },
    ],
  },
];

function ensureNotCancelled<T>(value: T | symbol): T {
  if (p.isCancel(value)) {
    p.cancel('已取消');
    process.exit(0);
  }
  return value as T;
}

interface ModelOption {
  value: string;
  label: string;
  hint?: string;
}

let cachedModelOptions: ModelOption[] | null = null;
function listAllModels(): ModelOption[] {
  if (cachedModelOptions) return cachedModelOptions;
  const options: ModelOption[] = [];
  for (const provider of getBuiltinProviders()) {
    for (const model of getBuiltinModels(provider)) {
      const value = `${provider}/${model.id}`;
      options.push({ value, label: value, hint: model.name });
    }
  }
  options.sort((a, b) => a.value.localeCompare(b.value));
  cachedModelOptions = options;
  return options;
}

interface DatasetOption {
  value: string;
  label: string;
  hint?: string;
}

interface ManifestShape {
  id?: string;
  label?: string;
  kind?: string;
  revision?: string;
  banks?: Record<string, number>;
  visibility?: string;
}

const PLAYSTYLE_LABEL: Record<string, string> = {
  'single-shot': 'oneshot',
  episode: 'walkthrough',
};

let cachedDatasetOptions: DatasetOption[] | null = null;
function listDatasetVersions(): DatasetOption[] {
  if (cachedDatasetOptions) return cachedDatasetOptions;
  const manifestDir = path.join(BENCH_PACKAGE_ROOT, 'dataset-manifests');
  const options: DatasetOption[] = [];
  if (!existsSync(manifestDir)) {
    cachedDatasetOptions = options;
    return options;
  }
  for (const entry of readdirSync(manifestDir)) {
    if (!entry.endsWith('.json') || entry === 'schema.json') continue;
    const file = path.join(manifestDir, entry);
    let manifest: ManifestShape;
    try {
      manifest = JSON.parse(readFileSync(file, 'utf8')) as ManifestShape;
    } catch {
      continue;
    }
    const id = manifest.id ?? entry.replace(/\.json$/, '');
    const parts: string[] = [];
    if (manifest.label) parts.push(manifest.label);
    if (manifest.kind) parts.push(PLAYSTYLE_LABEL[manifest.kind] ?? manifest.kind);
    if (manifest.banks) {
      const banks = Object.entries(manifest.banks)
        .map(([bank, count]) => `${bank}:${count}`)
        .join(', ');
      if (banks) parts.push(banks);
    }
    if (manifest.revision) parts.push(`rev ${manifest.revision}`);
    options.push({ value: id, label: id, hint: parts.join(' · ') || undefined });
  }
  options.sort((a, b) => a.value.localeCompare(b.value));
  cachedDatasetOptions = options;
  return options;
}

async function promptDataset(): Promise<string | null> {
  const options = listDatasetVersions();
  if (options.length === 0) {
    p.log.warn('未发现 dataset-manifests；改为手动输入 --dataset-version。');
    const raw = ensureNotCancelled(
      await p.text({
        message: '--dataset-version',
        placeholder: 'v1',
        validate: (v) => (v == null || v.trim() === '' ? '必填' : undefined),
      }),
    );
    return raw.trim() || null;
  }
  const picked = ensureNotCancelled(
    await p.autocomplete<string>({
      message: '--dataset-version（打字过滤，回车确认）',
      options,
      placeholder: 'v1 / v2-live-pilot / v2-blind-pilot …',
      maxItems: 12,
    }),
  );
  return picked;
}

async function promptModels(required: boolean): Promise<string[]> {
  const options = listAllModels();
  const picked = ensureNotCancelled(
    await p.autocompleteMultiselect<string>({
      message: '--models（打字过滤，空格勾选，回车确认）',
      options,
      placeholder: 'sonnet-5 / opus / deepseek …',
      maxItems: 12,
      required,
    }),
  );
  return picked;
}

function argValueOf(argv: string[], flag: string): string | undefined {
  const idx = argv.indexOf(flag);
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

function resolveDatasetsRoot(datasetDirArg: string | undefined): string {
  if (datasetDirArg) return path.resolve(datasetDirArg);
  const envDir = process.env.KANSOKU_BENCH_DATA_DIR;
  if (envDir) return path.resolve(envDir);
  return path.join(homedir(), '.cache', 'kansoku', 'bench', 'datasets');
}

async function promptQuestions(accumulated: string[]): Promise<string[]> {
  const version = argValueOf(accumulated, '--dataset-version');
  if (!version) {
    p.log.warn('未先选 --dataset-version，跳过 --questions 选择。');
    return [];
  }
  const bank = argValueOf(accumulated, '--bank') ?? 'swing';
  const root = resolveDatasetsRoot(argValueOf(accumulated, '--dataset-dir'));
  const dir = path.join(root, version, bank);
  if (!existsSync(dir)) {
    p.log.warn(`未找到题库目录：${dir}（是否先跑 sync-dataset ${version}？）`);
    return [];
  }
  const options = readdirSync(dir)
    .filter((entry) => entry.endsWith('.json'))
    .map((entry) => entry.replace(/\.json$/, ''))
    .sort()
    .map((id) => ({ value: id, label: id }));
  if (options.length === 0) {
    p.log.warn(`题库为空：${dir}`);
    return [];
  }
  const picked = ensureNotCancelled(
    await p.autocompleteMultiselect<string>({
      message: `--questions（${options.length} 题；不选则跑全部，打字过滤，空格勾选）`,
      options,
      placeholder: 'AAPL / 2026-06 / swing- …',
      maxItems: 15,
      required: false,
    }),
  );
  return picked;
}

async function collectFlags(
  specs: FlagSpec[],
  allowSkip: boolean,
  initialArgs: string[] = [],
): Promise<string[]> {
  const args: string[] = [];
  for (const spec of specs) {
    if (spec.boolean) {
      const on = ensureNotCancelled(
        await p.confirm({
          message: `${spec.flag}${spec.hint ? `（${spec.hint}）` : ''}`,
          initialValue: false,
        }),
      );
      if (on) args.push(spec.flag);
      continue;
    }
    if (spec.picker === 'models') {
      const picked = await promptModels(!allowSkip);
      if (picked.length > 0) args.push(spec.flag, picked.join(','));
      continue;
    }
    if (spec.picker === 'dataset') {
      const picked = await promptDataset();
      if (picked) args.push(spec.flag, picked);
      continue;
    }
    if (spec.picker === 'questions') {
      const picked = await promptQuestions([...initialArgs, ...args]);
      if (picked.length > 0) args.push(spec.flag, picked.join(','));
      continue;
    }
    const raw = ensureNotCancelled(
      await p.text({
        message: `${spec.flag}${allowSkip ? '（可留空）' : ''}`,
        placeholder: spec.placeholder ?? spec.hint ?? '',
        ...(allowSkip
          ? {}
          : {
              validate: (value: string | undefined) =>
                value == null || value.trim() === '' ? '必填' : undefined,
            }),
      }),
    );
    const trimmed = raw.trim();
    if (trimmed === '') continue;
    args.push(spec.flag, trimmed);
  }
  return args;
}

async function main(): Promise<void> {
  p.intro('kansoku bench');

  const id = ensureNotCancelled(
    await p.select({
      message: '选择要跑的子命令',
      options: COMMANDS.map((c) => ({
        value: c.id,
        label: c.title,
        hint: c.description,
      })),
    }),
  );

  const cmd = COMMANDS.find((c) => c.id === id);
  if (!cmd) {
    p.cancel(`未知子命令: ${id}`);
    process.exit(1);
  }

  const requiredArgs = await collectFlags(cmd.required, false);
  const supportsQuestions = cmd.id === 'run' || cmd.id === 'baseline';
  const questionArgs: string[] = [];
  if (supportsQuestions) {
    const picked = await promptQuestions(requiredArgs);
    if (picked.length > 0) questionArgs.push('--questions', picked.join(','));
  }
  const preOptional = [...requiredArgs, ...questionArgs];
  const optionalArgs =
    cmd.optional && cmd.optional.length > 0
      ? await (async () => {
          const wantOptional = ensureNotCancelled(
            await p.confirm({ message: '设置可选参数？', initialValue: false }),
          );
          return wantOptional ? collectFlags(cmd.optional!, true, preOptional) : [];
        })()
      : [];
  const argv = [...preOptional, ...optionalArgs];

  const autoReport = cmd.id === 'run' || cmd.id === 'baseline';
  if (autoReport && !argv.includes('--run-id')) {
    const runId = defaultRunId();
    argv.push('--run-id', runId);
    p.log.info(`自动补 --run-id ${runId}（跑完自动出 report）`);
  }

  let program: string;
  let programArgs: string[];
  let cwd: string;
  let printable: string;

  if (cmd.target === 'bench') {
    program = 'pnpm';
    programArgs = ['--filter', '@kansoku/bench', 'cli', cmd.id, ...argv];
    cwd = KANSOKU_ROOT;
    printable = `pnpm --filter @kansoku/bench cli ${cmd.id} ${argv.join(' ')}`.trim();
  } else {
    if (!existsSync(PRO_APP_DIR)) {
      p.log.warn('apps/pro 未 link，跳过执行。');
      p.log.info(`cd apps/pro && pnpm bench:run ${argv.join(' ')}`.trim());
      p.outro('未执行');
      return;
    }
    program = 'pnpm';
    programArgs = ['bench:run', ...argv];
    cwd = PRO_APP_DIR;
    printable = `cd apps/pro && pnpm bench:run ${argv.join(' ')}`.trim();
  }

  p.log.step(printable);

  const proceed = ensureNotCancelled(
    await p.confirm({ message: '执行？', initialValue: true }),
  );
  if (!proceed) {
    p.cancel('已取消');
    process.exit(0);
  }

  const code = await new Promise<number>((resolve) => {
    const child = spawn(program, programArgs, { cwd, stdio: 'inherit' });
    child.on('exit', (exitCode) => resolve(exitCode ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`${err.message}\n`);
      resolve(1);
    });
  });

  if (code !== 0) {
    p.outro(`失败（exit ${code}）`);
    process.exit(code);
  }

  if (autoReport) {
    const runId = argValueOf(argv, '--run-id');
    if (runId) {
      p.log.step(`自动出 report → run-id=${runId}`);
      const reportCode = await runChild(
        'pnpm',
        ['--filter', '@kansoku/bench', 'cli', 'report', '--run-id', runId, '--format', 'html'],
        KANSOKU_ROOT,
      );
      if (reportCode !== 0) {
        p.outro(`report 失败（exit ${reportCode}）`);
        process.exit(reportCode);
      }
      const reportPath = path.join(BENCH_PACKAGE_ROOT, 'results', runId, 'report.html');
      p.log.success(`open ${path.relative(process.cwd(), reportPath) || reportPath}`);
    }
  }

  p.outro('完成');
}

function runChild(program: string, args: string[], cwd: string): Promise<number> {
  return new Promise((resolve) => {
    const child = spawn(program, args, { cwd, stdio: 'inherit' });
    child.on('exit', (code) => resolve(code ?? 1));
    child.on('error', (err) => {
      process.stderr.write(`${err.message}\n`);
      resolve(1);
    });
  });
}

function defaultRunId(): string {
  const now = new Date();
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `run-${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
