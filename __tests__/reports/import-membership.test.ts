import { describe, it, expect } from 'vitest'
import { isImportedMembership } from '@/lib/payments/import-membership'

describe('isImportedMembership', () => {
  const importedMember = { is_imported: true }

  it('flags the row the import wrote (created_at = midnight UTC of start_date)', () => {
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T00:00:00Z', member: importedMember })).toBe(true)
    // PostgREST returns the timestamptz with an explicit offset.
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T00:00:00+00:00', member: importedMember })).toBe(true)
  })

  it('counts a later renewal by an imported member (stamped with the real time)', () => {
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T09:41:12.512Z', member: importedMember })).toBe(false)
  })

  it('counts memberships of members who were not imported', () => {
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T00:00:00Z', member: { is_imported: false } })).toBe(false)
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T00:00:00Z', member: null })).toBe(false)
    expect(isImportedMembership({ start_date: '2026-10-21', created_at: '2026-10-21T00:00:00Z' })).toBe(false)
  })
})
