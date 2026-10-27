import { api } from '@/lib/api/client'
import type { PushDeviceState } from '@/types/push'

type EnableResult =
  | { ok: true }
  | { ok: false; reason: 'denied' | 'unsupported' | 'error'; message: string }

export function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padded = base64Url + '='.repeat((4 - (base64Url.length % 4)) % 4)
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'))
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i)
  return out
}

function supported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function isIos(): boolean {
  const ua = navigator.userAgent
  // iPadOS 13+ reports as a Mac with touch.
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes('Macintosh') && navigator.maxTouchPoints > 1)
}

function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  )
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export async function getPushState(): Promise<PushDeviceState> {
  if (typeof window === 'undefined') return 'unsupported'
  // iOS only exposes push to Home Screen installs, so check before the API presence test.
  if (isIos() && !isStandalone()) return 'ios-needs-install'
  if (!supported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  if (Notification.permission !== 'granted') return 'off'
  try {
    return (await currentSubscription()) ? 'on' : 'off'
  } catch {
    return 'off'
  }
}

async function register(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON()
  await api.post('/api/member/push/subscribe', {
    endpoint: json.endpoint,
    keys: { p256dh: json.keys?.p256dh, auth: json.keys?.auth },
    userAgent: navigator.userAgent.slice(0, 200),
  })
}

/** Call from a user tap only: browsers ignore or block permission prompts without a gesture. */
export async function enablePush(publicKey: string): Promise<EnableResult> {
  if (!supported()) return { ok: false, reason: 'unsupported', message: 'This browser does not support notifications.' }
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') {
      return { ok: false, reason: 'denied', message: 'Notifications are blocked. Allow them in your browser settings.' }
    }
    const reg = await navigator.serviceWorker.ready
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      }))
    await register(sub)
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: 'error', message: err instanceof Error && err.message ? err.message : 'Could not turn on notifications.' }
  }
}

/** Always unsubscribes locally; rethrows a server failure afterwards so the caller can report it. */
export async function disablePush(): Promise<void> {
  const sub = await currentSubscription()
  if (!sub) return
  let serverError: unknown = null
  try {
    await api.delete('/api/member/push/subscribe', { endpoint: sub.endpoint })
  } catch (err) {
    serverError = err
  }
  await sub.unsubscribe()
  if (serverError) throw serverError
}

/** Idempotent re-registration on app open: covers endpoint rotation and a member switching on a shared phone. */
export async function resyncPush(): Promise<void> {
  try {
    if (!supported() || Notification.permission !== 'granted') return
    const sub = await currentSubscription()
    if (sub) await register(sub)
  } catch { /* best effort */ }
}
