import { defineConfig } from 'vitest/config'

// Explicit config so the root app's vitest.config is never picked up from the parent folder.
export default defineConfig({ test: { include: ['test/**/*.test.ts'], environment: 'node' } })
