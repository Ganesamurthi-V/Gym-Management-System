/**
 * Keeps a member's place in the pay flow while they are away in a UPI app.
 *
 * A UPI link (upi://pay) carries no return address and the app reports nothing back to a website, so the
 * page cannot be sent back automatically. What it can do is remember where the member was: on a phone the
 * browser or installed app is often reloaded when they return, which would otherwise drop the chosen plan or
 * amount. Everything here is best effort: storage can be unavailable (private mode), and then it does nothing.
 */

const MAX_AGE_MS = 45 * 60 * 1000
const OPENED_KEY = 'gf-upi-opened'

export const RENEW_DRAFT_KEY = 'gf-renew-draft'
export const DUE_DRAFT_KEY = 'gf-due-draft'

export function saveDraft(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify({ t: Date.now(), value }))
  } catch { /* storage unavailable */ }
}

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return null
    const parsed = JSON.parse(raw) as { t?: number; value?: T }
    if (typeof parsed.t !== 'number' || Date.now() - parsed.t > MAX_AGE_MS) {
      localStorage.removeItem(key)
      return null
    }
    return parsed.value ?? null
  } catch {
    return null
  }
}

/** Called when the member taps a UPI app: they are about to leave this page. */
export function markUpiOpened(): void {
  try {
    localStorage.setItem(OPENED_KEY, String(Date.now()))
  } catch { /* storage unavailable */ }
}

/** True if the member tapped a UPI app recently, even if the page was reloaded since. */
export function upiOpenedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(OPENED_KEY))
    return Number.isFinite(t) && t > 0 && Date.now() - t <= MAX_AGE_MS
  } catch {
    return false
  }
}

/** After a successful submit, or when the member starts over. */
export function clearPaymentDraft(): void {
  try {
    localStorage.removeItem(OPENED_KEY)
    localStorage.removeItem(RENEW_DRAFT_KEY)
    localStorage.removeItem(DUE_DRAFT_KEY)
  } catch { /* storage unavailable */ }
}
