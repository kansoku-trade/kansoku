import { defineConfig } from '@lobehub/eslint-config';

export default defineConfig(
  {
    ignores: ['.agents/**', 'apps/pro/**', '**/dist-*/**', '**/release/**'],
    react: 'vite',
    regexp: false,
    sortImports: false,
    sortKeys: false,
    yml: false,
  },
  {
    rules: {
      '@typescript-eslint/method-signature-style': 'off',
      'unicorn/prefer-at': 'off',
    },
  },
);
