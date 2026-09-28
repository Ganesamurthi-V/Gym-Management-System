import 'server-only'

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { Redis } from '@upstash/redis'

/**
 * lib/account/delete-otp.ts
 * ─────────────────────────
 * App-owned verification code for the "delete entire gym account" flow.
 *
 * ─── Why this replaces Supabase reauthentication ─────────────────────────────
 * The old flow used `supabase.auth.reauthenticate()` + `verifyOtp({ type:
 * 'reauthentication' })`. That code is a nonce bound to the session it was
 * issued under, so a token refresh between "send code" and "verify code"
 * invalidated it — a genuinely-correct code came back as `otp_expired`. Here the
 * app mints the code, stores a hash of it in Redis keyed to the user, and
 * verifies the typed code against that store. No session nonce, no refresh race.
 *
 * ─── What is stored ──────────────────────────────────────────────────────────
 * Only a SHA-256 hash of the code, never the code itself, under a per-user key
 * with a short TTL. A separate attempt counter caps guesses. The code is
 * single-use: a correct verification deletes the key.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/**
 * Code lifetime. Keep in sync with the {{{expiry_label}}} sent in the email.
 *
 * 5 minutes, not 60 seconds: the code travels by email, so the usable window
 * has to cover delivery latency PLUS the person opening their inbox, reading the
 * code, and typing it. A 60s TTL expired before most people finished that — the
 * key was already gone by verify time, which surfaced as "that code is
 * incorrect or has expired" for a genuinely-correct code. Five minutes is a
 * usable window for an emailed OTP while still limiting how long a leaked code
 * is live (the 5-attempt cap guards brute force).
 */
export const DELETE_OTP_TTL_SECONDS = 5 * 60
export const DELETE_OTP_EXPIRY_LABEL = '5 minutes'

/** How many wrong guesses before the code is burned and a new one is required. */
const MAX_ATTEMPTS = 5

const codeKey = (userId: string) => `delete-otp:code:${userId}`
const attemptsKey = (userId: string) => `delete-otp:attempts:${userId}`

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

/** Constant-time compare of two equal-length hex digests. */
function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/**
 * Generate a fresh 6-digit code, store its hash for `userId`, and return the
 * plaintext code so the caller can email it. Overwrites any existing code
 * (so "Resend" always issues a NEW code, never re-sends the old one) and resets
 * the attempt counter.
 */
export async function issueDeleteOtp(userId: string): Promise<string> {
  // randomInt is uniform and crypto-strong; pad so codes like "004821" keep 6 digits.
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

  await redis.set(codeKey(userId), hashCode(code), { ex: DELETE_OTP_TTL_SECONDS })
  await redis.del(attemptsKey(userId))

  return code
}

export type VerifyResult =
  | { ok: true }
  /** No code on file — never issued, or already expired/used. */
  | { ok: false; reason: 'expired' }
  /** Code present but the typed value did not match. */
  | { ok: false; reason: 'mismatch' }
  /** Too many wrong attempts; the code has been burned. */
  | { ok: false; reason: 'too_many_attempts' }

/**
 * Verify `code` for `userId`. On success the code is consumed (single-use). On
 * mismatch the attempt counter is bumped and the code is burned once it exceeds
 * MAX_ATTEMPTS, so a stolen email cannot be brute-forced within the TTL.
 */
export async function verifyDeleteOtp(userId: string, code: string): Promise<VerifyResult> {
  const stored = await redis.get<string>(codeKey(userId))
  if (!stored) return { ok: false, reason: 'expired' }

  if (hashesEqual(stored, hashCode(code))) {
    // Consume on success so the same code cannot be replayed.
    await redis.del(codeKey(userId))
    await redis.del(attemptsKey(userId))
    return { ok: true }
  }

  // Wrong code: count the attempt against the code's remaining lifetime.
  const attempts = await redis.incr(attemptsKey(userId))
  if (attempts === 1) {
    await redis.expire(attemptsKey(userId), DELETE_OTP_TTL_SECONDS)
  }
  if (attempts >= MAX_ATTEMPTS) {
    await redis.del(codeKey(userId))
    return { ok: false, reason: 'too_many_attempts' }
  }
  return { ok: false, reason: 'mismatch' }
}
