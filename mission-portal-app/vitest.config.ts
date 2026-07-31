import { defineConfig } from 'vitest/config'
import path from 'node:path'

/**
 * Unit tests for the app's pure logic.
 *
 * Deliberately no React Native preset: these tests cover modules that hold
 * real rules — moderation, roles, recurrence, palette extraction — none of
 * which touch a native module. Anything that does (uploads, pickers, the
 * WebView bridge) can only be verified on a device, so pretending to cover it
 * here would be worse than leaving it visibly uncovered.
 */
export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@app': path.resolve(__dirname, 'app'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
