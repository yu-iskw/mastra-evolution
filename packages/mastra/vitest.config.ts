import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineProject({
  resolve: {
    alias: {
      '@mastra-evolution/core': path.join(packageRoot, '../core/src/index.ts'),
      '@mastra-evolution/improvement': path.join(packageRoot, '../improvement/src/index.ts'),
      '@mastra-evolution/learning': path.join(packageRoot, '../learning/src/index.ts'),
      '@mastra-evolution/storage-local': path.join(packageRoot, '../storage-local/src/index.ts'),
      '@mastra-evolution/testing': path.join(packageRoot, '../testing/src/index.ts'),
    },
  },
  test: {
    name: '@mastra-evolution/mastra',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
