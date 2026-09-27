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

/**
 * Normalize a service-account private key into a valid PEM, whatever mangling the
 * host applied on the way in. Seen in the wild:
 *   - literal `\n` escapes (dotenv/most dashboards)    -> unescape to real newlines
 *   - surrounding single or double quotes              -> strip
 *   - `\r\n` (Windows / some CI)                        -> normalise to `\n`
 *   - accidental double-escaping (`\\n`)               -> collapse then unescape
 * A malformed key surfaces as the opaque
 * "secretOrPrivateKey must be an asymmetric key when using RS256" at send time,
 * so we validate the PEM markers here and fail with an actionable message instead.
 */
function normalizePrivateKey(raw: string): string {
  let key = raw.trim()

  // Strip a single layer of wrapping quotes if the host stored them literally.
  if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
    key = key.slice(1, -1)
  }

  // Collapse double-escaped, then turn literal escapes into real newlines.
  key = key.replace(/\\r\\n/g, '\n').replace(/\\n/g, '\n').replace(/\r\n/g, '\n')

  return key
}

function getApp(): App {
  const existing = getApps()
  if (existing.length) return existing[0]

  const projectId = process.env.FIREBASE_PROJECT_ID
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL
  const rawKey = process.env.FIREBASE_PRIVATE_KEY

  if (!projectId || !clientEmail || !rawKey) {
    throw new Error('Missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY')
  }

  const privateKey = normalizePrivateKey(rawKey)

  // Fail with a clear message rather than the cryptic RS256 error deep in the SDK.
  if (
    !privateKey.includes('-----BEGIN PRIVATE KEY-----') ||
    !privateKey.includes('-----END PRIVATE KEY-----') ||
    !privateKey.includes('\n')
  ) {
    throw new Error(
      'FIREBASE_PRIVATE_KEY is malformed: expected a PEM block with real newlines. ' +
      'Ensure the value is the full "-----BEGIN PRIVATE KEY-----...-----END PRIVATE KEY-----" ' +
      'string with literal \\n escapes (and wrapped in double quotes locally).'
    )
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
