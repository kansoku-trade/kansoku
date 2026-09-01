import { fileURLToPath } from 'node:url';
import zodCompiler from 'zod-compiler/vite';

export default {
  plugins: [zodCompiler()],
  resolve: {
    alias: {
      '@server': fileURLToPath(new URL('./src', import.meta.url)),
      '@pro': fileURLToPath(new URL('../pro/src', import.meta.url)),
    },
  },
};
