import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getMessaging, type Messaging } from 'firebase-admin/messaging'

/**
 * Lazy firebase-admin singleton for server-side FCM sends.
 *
 * Credentials come from three env vars derived from the Firebase service-account
 * JSON (never commit the JSON itself):
 *   FIREBASE_PROJECT_ID
 *   FIREBASE_CLIENT_EMAIL
 *   FIREBASE_PRIVATE_KEY   — paste with literal "\n" escapes; we unescape here,
 *                            since most host UIs store multi-line secrets that way.
 *
 * Throws if unconfigured so the dispatch route can fail loudly rather than
 * silently dropping pushes.
 */
let _messaging: Messaging | null = null

function getApp(): App {
  const existing = getApps()
  if (existing.length) return existing[0]

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  }

  return initializeApp({
    credential: cert({ projectId, clientEmail, privateKey }),
  })
}

export function getFcm(): Messaging {
  if (!_messaging) {
    _messaging = getMessaging(getApp())
  }
  return _messaging
}

/** True when the push credentials are present — lets callers no-op cleanly. */
export function isPushConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_PROJECT_ID &&
    process.env.FIREBASE_CLIENT_EMAIL &&
    process.env.FIREBASE_PRIVATE_KEY
  )
}
