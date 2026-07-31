import { defineConfig } from 'vitest/config'

/**
 * Rules tests, kept separate from the unit suite because they need the
 * Firebase emulator running. `npm run test:rules` starts it for them.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['rules-tests/**/*.test.ts'],
    // The emulator is a single shared instance, and each file clears it
    // between tests — running files in parallel would let them wipe each
    // other's fixtures mid-assertion.
    fileParallelism: false,
    testTimeout: 20000,
    hookTimeout: 30000,
  },
})
