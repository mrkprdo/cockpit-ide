import { defineConfig, Plugin } from 'vitest/config';

// Mirrors esbuild's `loader: { '.md': 'text' }` for Vitest/Vite
const mdTextPlugin: Plugin = {
  name: 'md-text',
  transform(code, id) {
    if (id.endsWith('.md')) {
      return { code: `export default ${JSON.stringify(code)};`, map: null };
    }
  },
};

export default defineConfig({
  plugins: [mdTextPlugin],
  test: {
    environment: 'jsdom',
    environmentOptions: {
      jsdom: {
        url: 'http://localhost',
      },
    },
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts'],
    // Forward the headless reconcile opt-in (src/test/specs-reconcile.test.ts)
    // into workers — vitest doesn't inherit arbitrary shell env vars.
    env: {
      SPECS_RECONCILE: process.env.SPECS_RECONCILE ?? 'report',
    },
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
        'src/renderer/specgen-hash.ts',
      ],
      thresholds: {
        statements: 70,
        branches: 60,
        functions: 65,
        lines: 70,
      },
    },
  },
  resolve: {
    conditions: ['browser', 'import'],
  },
});
