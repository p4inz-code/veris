import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true, // Windows workaround: prevents IPC corruption in Tinypool
        // that causes "Worker exited unexpectedly" and hash mismatches
        // when multiple fork workers run concurrently.
      },
    },
    include: ['packages/*/__tests__/**/*.test.ts'],
    exclude: [
      'node_modules',
      'dist',
      'packages/*/__tests__/**/*.integration.test.ts',
      'packages/*/__tests__/**/*.e2e.test.ts',
    ],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/*.bench.ts', '**/index.ts'],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
