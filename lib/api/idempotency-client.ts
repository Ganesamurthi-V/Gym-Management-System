import type { MutableRefObject } from 'react'

/**
 * One UUID per submission, reused only when the SAME payload is retried (a
 * double tap or a retry after a dropped connection). Changing the amount, member
 * etc. mints a new key, so a genuinely different payment is never mistaken for a
 * duplicate. Callers reset the ref to null once a response arrives.
 */
export type IdempotencySlot = MutableRefObject<{ fingerprint: string; key: string } | null>

export function idempotencyKeyFor(slot: IdempotencySlot, payload: unknown): string {
  const fingerprint = JSON.stringify(payload)
  if (!slot.current || slot.current.fingerprint !== fingerprint) {
    slot.current = { fingerprint, key: crypto.randomUUID() }
  }
  return slot.current.key
}

/** True when the server says this exact submission was already recorded. */
export async function isDuplicateResponse(res: Response): Promise<boolean> {
  if (res.status !== 409) return false
  try {
    const json = await res.clone().json()
    return json?.error?.code === 'DUPLICATE_REQUEST'
  } catch {
    return false
  }
}
