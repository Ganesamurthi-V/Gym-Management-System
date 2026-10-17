// Edge-safe (middleware runs on Edge, so no node:crypto timingSafeEqual).
// Hashing both sides first gives equal-length inputs, so the byte loop below
// does not leak the secret's length or where the first mismatch is.
export async function secureCompare(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder()
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a)),
    crypto.subtle.digest('SHA-256', enc.encode(b)),
  ])
  const x = new Uint8Array(ha)
  const y = new Uint8Array(hb)
  let diff = 0
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i]
  return diff === 0
}
