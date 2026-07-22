import { build } from 'esbuild';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = dirname(here);

await build({
  entryPoints: [join(desktopDir, 'src/cli/main.ts')],
  outfile: join(desktopDir, 'dist-agent-kit/cli.js'),
  platform: 'node',
  target: 'node20',
  format: 'esm',
  bundle: true,
  external: ['better-sqlite3', 'electron'],
  banner: {
    js: `import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);`,
  },
  logLevel: 'info',
});
