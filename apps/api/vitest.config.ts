import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // Every integration test file shares one Postgres database, so parallel
    // files would interleave truncations.
    fileParallelism: false,
    setupFiles: ['test/helpers/setup.ts'],
    testTimeout: 20000,
  },
})
