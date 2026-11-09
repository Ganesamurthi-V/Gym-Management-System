import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeDb } from './fakeDb'

vi.mock('server-only', () => ({}))

import { purgeOldDevicePunches } from '@/lib/devices/retention'

const NOW = new Date('2026-11-09T05:00:00Z')
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86400000).toISOString()

describe('purgeOldDevicePunches', () => {
  it('deletes unmatched rows after 30 days and applied after 365, keeping the rest', async () => {
    const db = createFakeDb()
    db.tables.device_punches.push(
      { id: 'a', state: 'unmapped', created_at: daysAgo(31) },
      { id: 'b', state: 'unmapped', created_at: daysAgo(10) },
      { id: 'c', state: 'applied', created_at: daysAgo(100) },
      { id: 'd', state: 'applied', created_at: daysAgo(400) },
      { id: 'e', state: 'error', created_at: daysAgo(40) },
      { id: 'f', state: 'processing', created_at: daysAgo(40) },
    )
    const res = await purgeOldDevicePunches(db as unknown as SupabaseClient, NOW)
    expect(res).toEqual({ deleted: 3 })
    expect(db.tables.device_punches.map(r => r.id).sort()).toEqual(['b', 'c', 'f'])
  })

  it('throws when a query fails so the caller can log it', async () => {
    const db = createFakeDb()
    db.failOn = (t, op) => t === 'device_punches' && op === 'select'
    await expect(purgeOldDevicePunches(db as unknown as SupabaseClient, NOW)).rejects.toThrow()
  })
})
