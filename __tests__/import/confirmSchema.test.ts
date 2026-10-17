import { describe, it, expect } from 'vitest'
import {
  importConfirmSchema, checkImportFile, declaredUncompressedSize,
  MAX_IMPORT_ROWS, MAX_IMPORT_FILE_BYTES,
} from '@/lib/import/schema'

const row = (over: Record<string, unknown> = {}) => ({ name: 'Akhil', phone: '9876543210', ...over })
const parse = (rows: unknown[], extra: Record<string, unknown> = {}) => importConfirmSchema.safeParse({ rows, ...extra })

describe('importConfirmSchema', () => {
  it('accepts a minimal row and applies defaults', () => {
    const r = parse([row()])
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.rows[0]).toMatchObject({ plan: 'monthly', category: 'both', payment_mode: 'cash', amount: 0 })
  })
  it('strips gym_id and unknown keys (row and body level)', () => {
    const r = parse([row({ gym_id: 'other-gym', __proto__: { x: 1 }, id: 'abc' })], { gym_id: 'other' })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.rows[0]).not.toHaveProperty('gym_id')
      expect(r.data.rows[0]).not.toHaveProperty('id')
      expect(r.data).not.toHaveProperty('gym_id')
    }
  })
  it('rejects empty and oversize batches', () => {
    expect(parse([]).success).toBe(false)
    expect(parse(Array.from({ length: MAX_IMPORT_ROWS }, () => row())).success).toBe(true)
    expect(parse(Array.from({ length: MAX_IMPORT_ROWS + 1 }, () => row())).success).toBe(false)
  })
  it('rejects bad types and oversize strings', () => {
    expect(parse([row({ name: 123 })]).success).toBe(false)
    expect(parse([row({ name: '   ' })]).success).toBe(false)
    expect(parse([row({ name: 'x'.repeat(256) })]).success).toBe(false)
    expect(parse([row({ area: 'x'.repeat(101) })]).success).toBe(false)
    expect(parse([row({ legacy_member_id: 'x'.repeat(51) })]).success).toBe(false)
    expect(parse([row({ phone: '9'.repeat(41) })]).success).toBe(false)
    expect(parse([row({ plan: 'platinum' })]).success).toBe(false)
    expect(parse(['not an object']).success).toBe(false)
  })
  it('rejects amount overflow, negatives and fractions', () => {
    expect(parse([row({ amount: '1500' })]).success).toBe(true)
    expect(parse([row({ amount: 10_000_001 })]).success).toBe(false)
    expect(parse([row({ amount: '99999999999999999999' })]).success).toBe(false)
    expect(parse([row({ amount: -1 })]).success).toBe(false)
    expect(parse([row({ amount: 1.5 })]).success).toBe(false)
    expect(parse([row({ amount: '1e9' })]).success).toBe(false)
  })
  it('rejects a member_number outside range but accepts blank', () => {
    expect(parse([row({ member_number: '' })]).success).toBe(true)
    expect(parse([row({ member_number: '42' })]).success).toBe(true)
    expect(parse([row({ member_number: 0 })]).success).toBe(false)
    expect(parse([row({ member_number: 1e12 })]).success).toBe(false)
  })
  it('drops soft fields that are invalid instead of failing the batch', () => {
    const r = parse([row({ age: '200', gender: 'x', date_of_birth: '2020-13-45', start_date: 'garbage', payment_mode: 'bitcoin', category: 'zumba' })])
    expect(r.success).toBe(true)
    if (r.success) {
      const d = r.data.rows[0]
      expect(d.age).toBeUndefined()
      expect(d.gender).toBeUndefined()
      expect(d.date_of_birth).toBeUndefined()
      expect(d.start_date).toBeUndefined()
      expect(d.payment_mode).toBe('cash')
      expect(d.category).toBe('both')
    }
  })
  it('accepts real dates and strips control characters from text', () => {
    const r = parse([row({ start_date: '2026-02-28', name: 'A\u0000ki\u0007l' })])
    expect(r.success).toBe(true)
    if (r.success) { expect(r.data.rows[0].start_date).toBe('2026-02-28'); expect(r.data.rows[0].name).toBe('Akil') }
    const bad = parse([row({ start_date: '2026-02-30' })])
    if (bad.success) expect(bad.data.rows[0].start_date).toBeUndefined()
  })
})

describe('checkImportFile', () => {
  it('enforces size, emptiness and extension', () => {
    expect(checkImportFile({ name: 'a.xlsx', size: 1000 }).ok).toBe(true)
    expect(checkImportFile({ name: 'A.CSV', size: 1000 }).ok).toBe(true)
    expect(checkImportFile({ name: 'a.xlsx', size: MAX_IMPORT_FILE_BYTES + 1 }).ok).toBe(false)
    expect(checkImportFile({ name: 'a.xlsx', size: 0 }).ok).toBe(false)
    expect(checkImportFile({ name: 'a.exe', size: 10 }).ok).toBe(false)
  })
})

describe('declaredUncompressedSize', () => {
  it('returns null for non-zip data', () => {
    expect(declaredUncompressedSize(new TextEncoder().encode('hello world, not a zip file at all').buffer as ArrayBuffer)).toBeNull()
  })
  it('sums the declared sizes of a zip central directory', () => {
    // One central-directory entry (46 bytes + 1-byte name) declaring 1 GiB, then EOCD.
    const name = 1
    const cd = new Uint8Array(46 + name)
    const cv = new DataView(cd.buffer)
    cv.setUint32(0, 0x02014b50, true)
    cv.setUint32(24, 1 << 30, true)
    cv.setUint16(28, name, true)
    const eocd = new Uint8Array(22)
    const ev = new DataView(eocd.buffer)
    ev.setUint32(0, 0x06054b50, true)
    ev.setUint16(10, 1, true)
    ev.setUint32(16, 0, true) // central directory offset
    const buf = new Uint8Array(cd.length + eocd.length)
    buf.set(cd); buf.set(eocd, cd.length)
    expect(declaredUncompressedSize(buf.buffer)).toBe(1 << 30)
  })
})
