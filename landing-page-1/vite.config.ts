import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Production hosting (Cloudflare) serves public/privacy.html at /privacy. Vite's dev and
// preview servers do not, and answer /privacy with the SPA's index.html, so the page appears
// to "redirect" to the home page. Rewrite the two clean URLs to their files locally.
const LEGAL_PAGES = ['/privacy', '/terms']
function cleanLegalUrls(): Plugin {
  const rewrite = (req: { url?: string }, _res: unknown, next: () => void) => {
    const path = (req.url ?? '').split('?')[0]
    if (LEGAL_PAGES.includes(path)) req.url = `${path}.html`
    next()
  }
  return {
    name: 'clean-legal-urls',
    configureServer: server => void server.middlewares.use(rewrite),
    configurePreviewServer: server => void server.middlewares.use(rewrite),
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), cleanLegalUrls()],
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
