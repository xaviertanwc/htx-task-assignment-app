import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    // Integration tests share one database, so test files must not interleave.
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
