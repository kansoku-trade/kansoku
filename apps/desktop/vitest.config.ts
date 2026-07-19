import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@desktop': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    globalSetup: './test/globalSetup.ts',
    server: {
      deps: {
        // electron-ipc-decorator imports electron at module scope; inline it
        // so vi.mock('electron') applies inside the library too.
        inline: ['electron-ipc-decorator'],
      },
    },
  },
});
