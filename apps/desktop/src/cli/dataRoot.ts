export function resolveDataRoot(argv: string[]): string | undefined {
  const flagIdx = argv.indexOf('--data-root');
  if (flagIdx >= 0 && argv[flagIdx + 1]) {
    const root = argv[flagIdx + 1];
    process.env.TRADE_PROJECT_ROOT = root;
    return root;
  }

  const fromKansokuEnv = process.env.KANSOKU_DATA_ROOT;
  if (fromKansokuEnv) {
    process.env.TRADE_PROJECT_ROOT = fromKansokuEnv;
    return fromKansokuEnv;
  }

  return process.env.TRADE_PROJECT_ROOT;
}
