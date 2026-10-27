/// <reference lib="webworker" />
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { CacheFirst, ExpirationPlugin, NetworkOnly, Serwist } from 'serwist'
import { safePushUrl } from '../lib/push/url'

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

/**
 * Web Push (member app only; owners never subscribe). The payload has no personal data because
 * lock screens are public. A malformed payload still shows a generic message: browsers penalise
 * a push event that shows nothing.
 */
self.addEventListener('push', (event) => {
  let title = 'GymFlow'
  let body = 'You have a new message'
  let tag = 'gymflow'
  let url = '/m/home'
  try {
    const data = event.data?.json()
    if (typeof data?.title === 'string' && data.title) title = data.title
    if (typeof data?.body === 'string' && data.body) body = data.body
    if (typeof data?.tag === 'string' && data.tag) tag = data.tag
    url = data?.url
  } catch {
    /* keep the generic text */
  }
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon-192.png',
      badge: '/favicon-192.png',
      tag,
      data: { url: safePushUrl(url) },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = safePushUrl(event.notification.data?.url)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        const { origin, pathname } = new URL(client.url)
        if (origin !== self.location.origin || !(pathname === '/m' || pathname.startsWith('/m/'))) continue
        await client.focus()
        if ('navigate' in client) {
          await client.navigate(target)
        } else {
          client.postMessage({ type: 'NAVIGATE', url: target })
        }
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

serwist.addEventListeners()
