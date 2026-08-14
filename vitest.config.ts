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
    // The email integration test sends REAL emails to real inboxes and
    // deletes/recreates user accounts — never run it as part of the normal
    // test suite. Run it manually when needed:
    //   npx vitest run __tests__/email/verification-email.test.ts
    exclude: ['__tests__/email/**'],
    globals: false,
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
})
