import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.smoke.ts'],
    testTimeout: 6 * 60_000,
    hookTimeout: 6 * 60_000,
  },
})
