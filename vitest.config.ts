import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['**/*.{test,spec}.{js,mjs,cjs,ts,mts,cts,jsx,tsx}'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/.{idea,git,cache,output,temp}/**'],
    coverage: {
      reporter: ['text', 'json', 'html'],
      exclude: ['**/node_modules/**', '**/dist/**', '**/test-utils/**'],
    },
    alias: {
      '@repo/db': path.resolve(__dirname, './packages/db/src'),
      '@repo/shared': path.resolve(__dirname, './packages/shared/src'),
      '@repo/workers': path.resolve(__dirname, './packages/workers/src'),
    },
  },
});
