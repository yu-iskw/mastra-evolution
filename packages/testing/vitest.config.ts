import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
  resolve: {
    alias: {
      '@mastra-evolution/core': path.join(packageRoot, '../core/src/index.ts'),
    },
  },
  test: {
    name: '@mastra-evolution/testing',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
