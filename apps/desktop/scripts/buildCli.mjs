import { build } from 'tsdown';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const desktopDir = dirname(here);

await build({
  entry: [join(desktopDir, 'src/cli/main.ts')],
  outDir: join(desktopDir, 'dist-agent-kit'),
  platform: 'node',
  target: 'node20',
  format: 'esm',
  external: (id) => {
    if (id === 'better-sqlite3' || id === 'electron') return true;
    if (/\/research\//.test(id)) return true;
    if (/\/ai\//.test(id) && !/\/ai\/personas\/follows/.test(id)) return true;
    if (/\/settings\/(aiSettings|settings\.(deps|test)|settingsStore|settingsValidation)/.test(id)) return true;
    return false;
  },
  treeshake: true,
  clean: false,
  dts: false,
  outputOptions: {
    entryFileNames: 'cli.js',
    inlineDynamicImports: true,
    banner: `import { createRequire } from 'node:module';\nconst require = createRequire(import.meta.url);`,
  },
});
