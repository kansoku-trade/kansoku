import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import babel from '@rolldown/plugin-babel';
import { isProModule, proLeakGuard, proOverlayPlugin } from '@kansoku/build-overlay';
import stylex from '@stylexjs/unplugin';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { LOCAL_APP_PORT } from '@kansoku/shared/localApp';
import { routeBuilderPlugin } from 'vite-plugin-route-builder';

const KERNEL_PORT = Number(process.env.KERNEL_PORT || 5200);
const KERNEL_URL = `http://localhost:${KERNEL_PORT}`;
const APP_VERSION = JSON.parse(
  readFileSync(new URL('../desktop/package.json', import.meta.url), 'utf8'),
).version;

const webRoot = fileURLToPath(new URL('.', import.meta.url));
const overlayRoot = fileURLToPath(new URL('../pro/overlays', import.meta.url));
const proPresent = process.env.KANSOKU_FORCE_FREE !== '1' && existsSync(overlayRoot);

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
  return isPro ? `assets/${PRO_CHUNK_DIR}[name]-[hash].js` : 'assets/[name]-[hash].js';
}

export interface AssetNameInput {
  originalFileNames: readonly string[];
}

export function assetFileNamesFor(asset: AssetNameInput): string {
  const isPro = asset.originalFileNames.some(isProModule);
  return isPro ? `assets/${PRO_CHUNK_DIR}[name]-[hash][extname]` : 'assets/[name]-[hash][extname]';
}

export default defineConfig({
  plugins: [
    stylex.vite({ aliases: { '@web/*': [`${webRoot}/src/*`] }, useCSSLayers: false }),
    routeBuilderPlugin({
      pagePattern: './src/pages/**/*.{tsx,sync.tsx}',
      outputPath: './src/generated-routes.ts',
      enableInDev: true,
      transformPath: (path) => path.replace(/\[\.\.\.[^\]]*\]/, '*'),
    }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    ...(proPresent ? [proOverlayPlugin({ overlayRoot })] : []),
    proLeakGuard({ proDir: PRO_CHUNK_DIR, overlayRoot: proPresent ? overlayRoot : undefined }),
  ],
  define: { __APP_VERSION__: JSON.stringify(APP_VERSION) },
  resolve: {
    alias: {
      '@web': fileURLToPath(new URL('./src', import.meta.url)),
      '@pro': fileURLToPath(new URL('../pro/src', import.meta.url)),
    },
  },
  server: {
    port: LOCAL_APP_PORT,
    proxy: {
      '/api': { target: KERNEL_URL, ws: true },
      '/legacy': { target: KERNEL_URL },
    },
  },
  worker: {
    format: 'es',
    // Workers get their own nested Rollup build, entirely separate from the
    // main build's plugins/rollupOptions above — without repeating both the
    // overlay resolver and the leak guard here, a pro overlay pulled in
    // through a worker entry would ship with zero boundary enforcement.
    plugins: () => [
      ...(proPresent ? [proOverlayPlugin({ overlayRoot })] : []),
      proLeakGuard({ proDir: PRO_CHUNK_DIR, overlayRoot: proPresent ? overlayRoot : undefined }),
    ],
    rollupOptions: {
      output: {
        chunkFileNames: chunkFileNamesFor,
        assetFileNames: assetFileNamesFor,
      },
    },
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(webRoot, 'index.html'),
        train: resolve(webRoot, 'train.html'),
        canvasGuest: resolve(webRoot, 'canvas-guest.html'),
      },
      output: {
        chunkFileNames: chunkFileNamesFor,
        assetFileNames: assetFileNamesFor,
      },
    },
  },
});
