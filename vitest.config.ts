import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

/**
 * Vitest configuration.
 *
 * Tests run in a Node environment (the WhatsApp automation engine is server-side
 * only). The `@/…` path alias mirrors tsconfig so imports resolve identically to
 * the app.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['__tests__/**/*.test.ts'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
