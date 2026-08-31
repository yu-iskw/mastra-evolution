import { defineProject } from 'vitest/config';

export default defineProject({
  test: {
    name: '@mastra-evolution/core',
    include: ['src/**/*.{test,spec}.ts'],
    exclude: ['dist/**'],
  },
});
