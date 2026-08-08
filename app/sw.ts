/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

/**
 * Service worker for the unified GymFlow PWA (app.gymflow.sbs).
 *
 * ONE worker serves both the owner console (/owner/*) and the member app
 * (/m/*), because after the merge they share a single origin — a browser only
 * allows one service worker per scope.
 *
 * ── SECURITY: WHAT IS DELIBERATELY NEVER CACHED ─────────────────────────────
 * Both experiences are multi-tenant and cookie-authenticated, and the owner
 * console can read every member of a gym. Putting any authenticated response in
 * Cache Storage would leave it readable by the next person to use the device,
 * and could serve one signed-in user content generated for another. So:
 *
 *   - Navigations (HTML/RSC documents)  -> NetworkOnly
 *   - Anything on *.supabase.co         -> NetworkOnly, for every HTTP method
 *   - Only same-origin static build output (script / style / font / worker /
 *     image) is cached, plus the static offline shell.
 *
 * Route handlers under /api are not matched by any caching strategy here, so
 * they fall through to the network as well.
 */
const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,
  runtimeCaching: [
    {
      matcher: ({ request, sameOrigin }) =>
        sameOrigin && ['style', 'script', 'worker', 'font'].includes(request.destination),
      handler: new CacheFirst({
        cacheName: 'gymflow-static-v1',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'gymflow-images-v1',
        plugins: [new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === 'navigate',
      handler: new NetworkOnly(),
    },
  ],
  fallbacks: {
    entries: [
      {
        url: '/offline.html',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

// Never place authenticated Supabase responses, authorization headers, or
// mutation bodies in Cache Storage.
for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  serwist.registerCapture(
    ({ url }) => url.hostname.endsWith('.supabase.co'),
    new NetworkOnly(),
    method,
  )
}

/**
 * Sign-out hook. The client posts this on logout so no bytes generated for the
 * previous account survive in Cache Storage on a shared device.
 */
self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_RUNTIME_CACHES') return
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
  )
})

serwist.addEventListeners()
