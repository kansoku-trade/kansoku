import { runChart } from './commands/chart.js';
import { runInfo } from './commands/info.js';
import { resolveDataRoot } from './dataRoot.js';

const HELP_TEXT = `kansoku-cli — data-root operations for Kansoku

Usage:
  kansoku-cli <command> [options]

Commands:
  info kit-version           print the packaged Agent Kit version
  info data-root             print the resolved data root path
  info version               print the CLI's own version (matches App)
  chart create               create a chart (--type, --symbol, --json-input)
  chart list                 list chart metas (--symbol, --date)
  chart get <id>             print a chart's meta + data

Data root resolution (priority):
  --data-root <path>         command-line flag
  $KANSOKU_DATA_ROOT         environment
  $TRADE_PROJECT_ROOT        environment

Environment set by App:
  $KANSOKU_CLI, $KANSOKU_DATA_ROOT, $KANSOKU_APP_VERSION, $KANSOKU_KIT_VERSION
  loaded from <dataRoot>/.kansoku-agent-kit/runtime.env
`;

function printHelp(): void {
  process.stdout.write(HELP_TEXT);
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    return printHelp();
  }

  const command = argv[0];
  const rest = argv.slice(1);

  resolveDataRoot(rest);

  switch (command) {
    case 'info': {
      return runInfo(rest);
    }
    case 'chart': {
      return runChart(rest);
    }
    default: {
      process.stderr.write(`Unknown command: ${command}\n`);
      process.exit(64);
    }
  }
}

main().catch((err) => {
  process.stderr.write((err instanceof Error ? err.message : String(err)) + '\n');
  process.exit(1);
});
