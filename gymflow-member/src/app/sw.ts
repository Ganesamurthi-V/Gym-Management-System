import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

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
        cacheName: 'gymflow-member-static-v1',
        plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === 'image',
      handler: new CacheFirst({
        cacheName: 'gymflow-member-images-v1',
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
// mutation bodies in Cache Storage. Offline writes use the app-level Dexie
// queue in a later milestone and obtain a fresh session when replayed.
for (const method of ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const) {
  serwist.registerCapture(
    ({ url }) => url.hostname.endsWith('.supabase.co'),
    new NetworkOnly(),
    method,
  )
}

self.addEventListener('message', (event) => {
  if (event.data?.type !== 'CLEAR_RUNTIME_CACHES') return
  event.waitUntil(
    caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name)))),
  )
})

serwist.addEventListeners()
