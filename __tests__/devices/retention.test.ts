import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeDb } from './fakeDb'

vi.mock('server-only', () => ({}))

import { purgeOldDevicePunches, purgeOldDeviceCommands } from '@/lib/devices/retention'

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

describe('purgeOldDeviceCommands', () => {
  it('deletes done and failed commands after 30 days, never queued or sent', async () => {
    const db = createFakeDb()
    db.tables.device_commands.push(
      { id: 1, state: 'done', created_at: daysAgo(31) },
      { id: 2, state: 'failed', created_at: daysAgo(45) },
      { id: 3, state: 'done', created_at: daysAgo(5) },
      { id: 4, state: 'queued', created_at: daysAgo(90) },
      { id: 5, state: 'sent', created_at: daysAgo(90) },
    )
    const res = await purgeOldDeviceCommands(db as unknown as SupabaseClient, NOW)
    expect(res).toEqual({ deleted: 2 })
    expect(db.tables.device_commands.map(r => r.id)).toEqual([3, 4, 5])
  })
})
