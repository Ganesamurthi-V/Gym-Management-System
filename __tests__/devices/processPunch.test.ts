import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeDb } from './fakeDb'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { ingestPunches, replayUnmappedPunches } from '@/lib/devices/processPunch'

const NOW = new Date('2026-11-09T05:00:00Z') // 10:30 IST
const device = { id: 'dev1', gym_id: 'gym1', timezone: 'Asia/Kolkata' }

function setup(mapped = true) {
  const db = createFakeDb()
  if (mapped) db.tables.device_user_map.push({ device_id: 'dev1', pin: '7', member_id: 'mem1' })
  return { db, client: db as unknown as SupabaseClient }
}
const punch = (time: string, pin = '7') => ({ pin, time })
const states = (db: ReturnType<typeof createFakeDb>) => db.tables.device_punches.map(r => r.state)

beforeEach(() => { vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(NOW) })
afterEach(() => vi.useRealTimers())

describe('ingestPunches', () => {
  it('check-in, check-out, then a third punch is a duplicate', async () => {
    const { db, client } = setup()
    const res = await ingestPunches(client, device, [
      punch('2026-11-09 09:00:00'), punch('2026-11-09 09:30:00'), punch('2026-11-09 10:00:00'),
    ], NOW)
    expect(res).toEqual({ accepted: 3, failed: false })
    expect(states(db)).toEqual(['applied', 'applied', 'duplicate'])
    expect(db.tables.attendance).toHaveLength(1)
    const row = db.tables.attendance[0]
    expect(row).toMatchObject({ gym_id: 'gym1', member_id: 'mem1', date: '2026-11-09', session: 'morning', source: 'device' })
    expect(row.created_at).toBe('2026-11-09T03:30:00.000Z')
    expect(row.check_out_time).toBe('2026-11-09T04:00:00.000Z')
  })

  it('treats a second punch within 60 s as a duplicate, not a check-out', async () => {
    const { db, client } = setup()
    await ingestPunches(client, device, [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:00:40')], NOW)
    expect(states(db)).toEqual(['applied', 'duplicate'])
    expect(db.tables.attendance[0].check_out_time).toBeNull()
  })

  it('is idempotent when the same batch is posted again', async () => {
    const { db, client } = setup()
    const batch = [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:30:00')]
    await ingestPunches(client, device, batch, NOW)
    const again = await ingestPunches(client, device, batch, NOW)
    expect(again).toEqual({ accepted: 0, failed: false })
    expect(db.tables.device_punches).toHaveLength(2)
    expect(db.tables.attendance[0].check_out_time).toBe('2026-11-09T04:00:00.000Z')
  })

  it('marks old and future punches stale without touching attendance', async () => {
    const { db, client } = setup()
    await ingestPunches(client, device, [punch('2026-11-01 09:00:00'), punch('2026-11-09 11:00:00')], NOW)
    expect(states(db)).toEqual(['stale', 'stale'])
    expect(db.tables.attendance).toHaveLength(0)
  })

  it('records unmapped pins and applies them when replayed after mapping', async () => {
    const { db, client } = setup(false)
    await ingestPunches(client, device, [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:30:00')], NOW)
    expect(states(db)).toEqual(['unmapped', 'unmapped'])
    expect(db.tables.attendance).toHaveLength(0)

    db.tables.attendance_devices.push({ id: 'dev1', gym_id: 'gym1', timezone: 'Asia/Kolkata' })
    const replay = await replayUnmappedPunches(client, { gymId: 'gym1', deviceId: 'dev1', pin: '7', memberId: 'mem1' })
    expect(replay).toEqual({ applied: 2 })
    expect(states(db)).toEqual(['applied', 'applied'])
    expect(db.tables.attendance[0]).toMatchObject({ member_id: 'mem1', source: 'device' })
    expect(db.tables.attendance[0].check_out_time).toBe('2026-11-09T04:00:00.000Z')
  })

  it('does not replay a device that belongs to another gym', async () => {
    const { db, client } = setup(false)
    db.tables.attendance_devices.push({ id: 'dev1', gym_id: 'gym1', timezone: 'Asia/Kolkata' })
    await ingestPunches(client, device, [punch('2026-11-09 09:00:00')], NOW)
    expect(await replayUnmappedPunches(client, { gymId: 'other', deviceId: 'dev1', pin: '7', memberId: 'mem1' })).toEqual({ applied: 0 })
    expect(db.tables.attendance).toHaveLength(0)
  })

  it('reports failure on a DB error and retries the unprocessed punch next time', async () => {
    const { db, client } = setup()
    db.failOn = (t, op) => t === 'attendance' && op === 'insert'
    const res = await ingestPunches(client, device, [punch('2026-11-09 09:00:00')], NOW)
    expect(res.failed).toBe(true)
    expect(states(db)).toEqual(['error'])

    db.failOn = () => false
    const retry = await ingestPunches(client, device, [punch('2026-11-09 09:00:00')], NOW)
    expect(retry).toEqual({ accepted: 0, failed: false })
    expect(states(db)).toEqual(['applied'])
    expect(db.tables.attendance).toHaveLength(1)
  })
})

describe('ingestPunches hardening', () => {
  it('does not touch rows another request holds in processing, and sweeps stale claims', async () => {
    const { db, client } = setup()
    db.tables.device_punches.push(
      { id: 'live', device_id: 'dev1', pin: '7', punched_at: '2026-11-09T03:30:00.000Z', state: 'processing', claimed_at: NOW.toISOString() },
      { id: 'dead', device_id: 'dev1', pin: '7', punched_at: '2026-11-09T03:40:00.000Z', state: 'processing', claimed_at: '2026-11-09T04:00:00.000Z' },
    )
    // Overlapping retry of the first row plus a new one: 'live' must not be processed again.
    const res = await ingestPunches(client, device, [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:30:00')], NOW)
    expect(res.failed).toBe(false)
    const byId = Object.fromEntries(db.tables.device_punches.map(r => [r.id, r.state]))
    expect(byId.live).toBe('processing')
    expect(byId.dead).toBe('applied') // swept to error, then re-claimed and applied
    expect(db.tables.attendance).toHaveLength(1)
  })

  it('claims a stranded error row exactly once', async () => {
    const { db, client } = setup()
    db.failOn = (t, op) => t === 'attendance' && op === 'insert'
    expect((await ingestPunches(client, device, [punch('2026-11-09 09:00:00')], NOW)).failed).toBe(true)
    expect(states(db)).toEqual(['error'])
    db.failOn = () => false
    const retry = await ingestPunches(client, device, [punch('2026-11-09 09:00:00')], NOW)
    expect(retry).toEqual({ accepted: 0, failed: false })
    expect(states(db)).toEqual(['applied'])
    expect(db.tables.attendance).toHaveLength(1)
  })

  it('loads the pin map once for the whole batch', async () => {
    const { db, client } = setup()
    db.tables.device_user_map.push({ device_id: 'dev1', pin: '8', member_id: 'mem2' })
    let mapReads = 0
    const from = db.from.bind(db)
    db.from = (t: string) => { if (t === 'device_user_map') mapReads++; return from(t) }
    await ingestPunches(client, device, [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:10:00', '8'), punch('2026-11-09 09:20:00', '9')], NOW)
    expect(mapReads).toBe(1)
    expect(states(db)).toEqual(['applied', 'applied', 'unmapped'])
  })

  it('falls back to Asia/Kolkata for an invalid stored timezone instead of dropping punches', async () => {
    const { db, client } = setup()
    const res = await ingestPunches(client, { ...device, timezone: 'Nowhere/Land' }, [punch('2026-11-09 09:00:00')], NOW)
    expect(res).toEqual({ accepted: 1, failed: false })
    expect(db.tables.device_punches[0].punched_at).toBe('2026-11-09T03:30:00.000Z')
  })
})

describe('blocked members', () => {
  it('records a blocked pin as blocked with the member and writes no attendance (batch path)', async () => {
    const { db, client } = setup(false)
    db.tables.device_user_map.push({ device_id: 'dev1', pin: '7', member_id: 'mem1', blocked: true })
    db.tables.device_user_map.push({ device_id: 'dev1', pin: '8', member_id: 'mem2', blocked: false })
    await ingestPunches(client, device, [punch('2026-11-09 09:00:00'), punch('2026-11-09 09:05:00', '8')], NOW)
    expect(states(db)).toEqual(['blocked', 'applied'])
    expect(db.tables.device_punches[0].member_id).toBe('mem1')
    expect(db.tables.attendance).toHaveLength(1)
    expect(db.tables.attendance[0].member_id).toBe('mem2')
  })
})
