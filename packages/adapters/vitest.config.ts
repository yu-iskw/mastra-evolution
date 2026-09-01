import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineProject } from 'vitest/config';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const coreSrc = path.join(packageRoot, '../core/src');

export default defineProject({
  root: packageRoot,
  resolve: {
    alias: {
      '@mastra-evolution/core/storage-postgres': path.join(coreSrc, 'storage-postgres/index.ts'),
      '@mastra-evolution/core/storage-local': path.join(coreSrc, 'storage-local/index.ts'),
      '@mastra-evolution/core/improvement': path.join(coreSrc, 'improvement/index.ts'),
      '@mastra-evolution/core/learning': path.join(coreSrc, 'learning/index.ts'),
      '@mastra-evolution/core/testing': path.join(coreSrc, 'testing/index.ts'),
      '@mastra-evolution/core': path.join(coreSrc, 'index.ts'),
    },
  },
  test: {
    name: '@mastra-evolution/adapters',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
