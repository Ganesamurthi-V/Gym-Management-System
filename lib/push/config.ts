import 'server-only'
import webpush from 'web-push'

/** VAPID subject must be a mailto: or https: URL (push services reject anything else). */
function validSubject(s: string | undefined): s is string {
  return !!s && (/^mailto:[^\s@]+@[^\s@]+$/.test(s) || /^https:\/\/[^\s]+$/.test(s))
}

/** The feature is off (and the toggle hidden) unless all three VAPID values are set. */
export function isPushConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY && validSubject(process.env.VAPID_SUBJECT)
}

export function vapidPublicKey(): string | null {
  return isPushConfigured() ? (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string) : null
}

let configured = false

/** Configures web-push once per process. Returns false when VAPID env is missing. Never logs keys. */
export function configureWebPush(): boolean {
  if (!isPushConfigured()) return false
  if (!configured) {
    webpush.setVapidDetails(
      process.env.VAPID_SUBJECT as string,
      process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY as string,
      process.env.VAPID_PRIVATE_KEY as string,
    )
    configured = true
  }
  return true
}
