import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectProofType, proofPathBelongsToGym } from '@/lib/renewal/proof'

const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), 'utf8')
const GYM = '3f2c1a9e-1111-4222-8333-444455556666'
const OTHER = '99999999-aaaa-4bbb-8ccc-dddddddddddd'

describe('proofPathBelongsToGym', () => {
  it('accepts a file inside the gym folder', () => {
    expect(proofPathBelongsToGym(`${GYM}/member-id/1700000000-proof.jpg`, GYM)).toBe(true)
  })
  it('refuses another gym, a bare prefix, and any way of climbing out of the folder', () => {
    expect(proofPathBelongsToGym(`${OTHER}/member-id/proof.jpg`, GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}/`, GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}/../${OTHER}/x.jpg`, GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}//x.jpg`, GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}${String.fromCharCode(92)}x.jpg`, GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}x/member/proof.jpg`, GYM)).toBe(false)
    expect(proofPathBelongsToGym('', GYM)).toBe(false)
    expect(proofPathBelongsToGym(`${GYM}/a.jpg`, '')).toBe(false)
  })
})

describe('detectProofType', () => {
  it('reads the type from the bytes, not from the name', () => {
    expect(detectProofType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg')
    expect(detectProofType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe('image/png')
    expect(detectProofType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]))).toBe('application/pdf')
    expect(detectProofType(new TextEncoder().encode('<html><script>'))).toBeNull()
    expect(detectProofType(new Uint8Array([]))).toBeNull()
  })
})

describe('proof access is owner-only and never hands out a storage link', () => {
  const migration = read('supabase/migrations/20261027150000_member_renewal_requests.sql')
  const schema = read('supabase-schema.sql')
  const fileRoute = read('app/api/renewal-requests/[id]/proof/file/route.ts')
  const jsonRoute = read('app/api/renewal-requests/[id]/proof/route.ts')

  it('the bucket is private and has no storage policy for any user', () => {
    expect(migration).toMatch(/'member_payment_proofs',\s*'member_payment_proofs',\s*false/)
    for (const sql of [migration, schema]) {
      const policies = sql.split(';').filter(stmt => /create\s+policy/i.test(stmt) && /storage\.objects/i.test(stmt))
      expect(policies.some(p => p.includes('member_payment_proofs'))).toBe(false)
    }
  })

  it('the file route needs an owner session, scopes the lookup to the gym, and checks the path prefix', () => {
    expect(fileRoute).toMatch(/withAuth\(/)
    expect(fileRoute).toMatch(/\.eq\('gym_id', gym\.id\)/)
    expect(fileRoute).toMatch(/proofPathBelongsToGym\(request\.proof_path, gym\.id\)/)
    expect(fileRoute).toMatch(/'Cache-Control': 'private, no-store'/)
    expect(fileRoute).toMatch(/'X-Content-Type-Options': 'nosniff'/)
  })

  it('the storage path comes from the database row, never from the request URL', () => {
    expect(fileRoute).not.toMatch(/searchParams/)
    expect(fileRoute).toMatch(/\.download\(request\.proof_path\)/)
  })

  it('the JSON route returns no signed URL and no raw path', () => {
    expect(jsonRoute).not.toMatch(/createSignedUrl|signedUrl|createAdminClient/)
    expect(jsonRoute).toMatch(/\/api\/renewal-requests\/\$\{id\}\/proof\/file/)
  })
})
