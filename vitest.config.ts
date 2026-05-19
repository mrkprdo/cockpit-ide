import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    COMMIT_HASH: '"20260519"',
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Color green for <20ms, yellow for <100ms, red for >=100ms
    slowTestThreshold: 100,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/renderer/index.ts',
        'src/renderer/index.html',
        'src/test/**',
        '**/*.test.ts',
      ],
    },
  },
  resolve: {
    conditions: ['browser', 'import'],
  },
});
