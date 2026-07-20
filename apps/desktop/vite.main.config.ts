import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { isProModule, proLeakGuard, proOverlayPlugin } from '@kansoku/build-overlay';

const desktopDir = fileURLToPath(new URL('.', import.meta.url));
const overlayRoot = fileURLToPath(new URL('../pro/overlays', import.meta.url));
const proPresent = process.env.KANSOKU_FORCE_FREE !== '1' && existsSync(overlayRoot);
const isDev = process.env.KANSOKU_DESKTOP_DEV === '1';

export const PRO_CHUNK_DIR = '__pro__/';

export interface ChunkNameInput {
  name: string;
  moduleIds: readonly string[];
  facadeModuleId?: string | null;
}

export function chunkFileNamesFor(chunk: ChunkNameInput): string {
  const isPro =
    chunk.moduleIds.some(isProModule) ||
    (chunk.facadeModuleId != null && isProModule(chunk.facadeModuleId));
  return isPro ? `${PRO_CHUNK_DIR}[name]-[hash].mjs` : '[name]-[hash].mjs';
}

export default defineConfig({
  root: desktopDir,

  define: {
    __DESKTOP_DEV__: JSON.stringify(isDev),
  },
  ssr: {
    // Single-graph invariant: everything JS is bundled so main and the pro
    // chunk share one module instance of every dep (tsuki decorator metadata
    // keys on module-local Symbols — two copies would split the registry).
    // Only host-provided electron and the two native packages stay external,
    // which is also exactly the set electron-builder ships in node_modules.
    noExternal: true,
    external: ['better-sqlite3', 'electron-sparkle-updater'],
  },
  build: {
    ssr: true,
    outDir: 'dist-main',
    emptyOutDir: true,
    minify: false,
    target: 'node24',
    sourcemap: false,
    rollupOptions: {
      input: { main: fileURLToPath(new URL('./src/main.ts', import.meta.url)) },
      external: [/^electron($|\/)/, /^better-sqlite3($|\/)/, /^electron-sparkle-updater($|\/)/],
      output: {
        format: 'es',
        entryFileNames: '[name].mjs',
        chunkFileNames: chunkFileNamesFor,
      },
    },
  },
  plugins: [
    ...(proPresent ? [proOverlayPlugin({ overlayRoot })] : []),
    proLeakGuard({ proDir: PRO_CHUNK_DIR }),
  ],
});
