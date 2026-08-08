'use client'

/**
 * lib/activation-store.ts
 *
 * Remembers the in-flight activation in the browser so the page the member
 * lands on AFTER opening their email can still act on it.
 *
 * The verification link arrives without our invitation token (Supabase controls
 * that URL), so when the link turns out to be already-consumed there is nothing
 * in the URL to resend against. Stashing it at submit time gives the member a
 * one-tap recovery instead of a dead end.
 *
 * Only the invitation token, member id and email are stored — no credentials.
 * Entries self-expire so a stale one cannot resurrect an old invitation.
 */

const KEY = 'gymflow:activation'
const TTL_MS = 24 * 60 * 60 * 1000 // matches the invitation lifetime

export type ActivationStash = {
  token: string
  memberId: string
  email: string
  savedAt: number
}

export function saveActivation(data: Omit<ActivationStash, 'savedAt'>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }))
  } catch {
    // Storage disabled (private mode / quota) — recovery just won't be offered.
  }
}

export function loadActivation(): ActivationStash | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return null

    const parsed = JSON.parse(raw) as ActivationStash
    if (!parsed?.token || !parsed?.memberId) return null
    if (Date.now() - (parsed.savedAt ?? 0) > TTL_MS) {
      window.localStorage.removeItem(KEY)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function clearActivation(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
