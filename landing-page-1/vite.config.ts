import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    // Must mirror the "paths" entry in tsconfig.app.json. TypeScript resolves
    // @/* for the typecheck, but Vite needs its own mapping to resolve it at
    // build time — configure one without the other and `tsc -b` passes while
    // the bundle fails.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
