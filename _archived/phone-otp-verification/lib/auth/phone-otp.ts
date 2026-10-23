import 'server-only'

import { createHash, randomInt, timingSafeEqual } from 'node:crypto'
import { Redis } from '@upstash/redis'

/**
 * lib/auth/phone-otp.ts
 * ─────────────────────
 * WhatsApp code that proves a new owner controls a mobile number before a gym exists.
 * Same design as lib/account/delete-otp.ts (hash only in Redis, 5 attempts then burned,
 * single use, constant-time compare), keyed by user id. The pending normalised phone is
 * stored beside the hash so verify knows which number the code was sent to; the client
 * never supplies it again.
 */

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

/** Covers WhatsApp delivery plus typing; the attempt cap guards brute force. */
export const PHONE_OTP_TTL_SECONDS = 5 * 60

const MAX_ATTEMPTS = 5

const codeKey = (userId: string) => `phone-otp:code:${userId}`
const attemptsKey = (userId: string) => `phone-otp:attempts:${userId}`
const phoneKey = (userId: string) => `phone-otp:phone:${userId}`

function hashCode(code: string): string {
  return createHash('sha256').update(code).digest('hex')
}

function hashesEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'hex')
  const bufB = Buffer.from(b, 'hex')
  if (bufA.length !== bufB.length) return false
  return timingSafeEqual(bufA, bufB)
}

/** Store a fresh code for `userId` + `phoneE164` (replacing any old one) and return the plaintext. */
export async function issuePhoneOtp(userId: string, phoneE164: string): Promise<string> {
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')

  await redis.set(codeKey(userId), hashCode(code), { ex: PHONE_OTP_TTL_SECONDS })
  await redis.set(phoneKey(userId), phoneE164, { ex: PHONE_OTP_TTL_SECONDS })
  await redis.del(attemptsKey(userId))

  return code
}

/** Remove a pending code, e.g. when the WhatsApp send failed. */
export async function clearPhoneOtp(userId: string): Promise<void> {
  await redis.del(codeKey(userId))
  await redis.del(phoneKey(userId))
  await redis.del(attemptsKey(userId))
}

export type VerifyPhoneOtpResult =
  | { ok: true; phone: string }
  | { ok: false; reason: 'expired' | 'mismatch' | 'too_many_attempts' }

export async function verifyPhoneOtp(userId: string, code: string): Promise<VerifyPhoneOtpResult> {
  const [stored, phone] = await Promise.all([
    redis.get<string>(codeKey(userId)),
    redis.get<string>(phoneKey(userId)),
  ])
  if (!stored || !phone) return { ok: false, reason: 'expired' }

  if (hashesEqual(stored, hashCode(code))) {
    await redis.del(codeKey(userId))
    await redis.del(phoneKey(userId))
    await redis.del(attemptsKey(userId))
    // Upstash may hand back a numeric-looking string as a number.
    return { ok: true, phone: String(phone) }
  }

  const attempts = await redis.incr(attemptsKey(userId))
  if (attempts === 1) await redis.expire(attemptsKey(userId), PHONE_OTP_TTL_SECONDS)
  if (attempts >= MAX_ATTEMPTS) {
    await clearPhoneOtp(userId)
    return { ok: false, reason: 'too_many_attempts' }
  }
  return { ok: false, reason: 'mismatch' }
}
