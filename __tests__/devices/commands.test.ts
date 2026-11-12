import { describe, it, expect, vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createFakeDb } from './fakeDb'

vi.mock('server-only', () => ({}))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { buildCommandLine, sanitizeName } from '@/lib/devices/commandLines'
import {
  ackCommands, claimNextCommands, enqueueDeviceCommand, enqueueMemberDeviceSync, queueExpiredMemberRemovals,
} from '@/lib/devices/commands'

const NOW = new Date('2026-11-09T05:00:00Z')
const asDb = (d: ReturnType<typeof createFakeDb>) => d as unknown as SupabaseClient
const base = { gymId: 'gym1', deviceId: 'dev1', memberId: 'mem1' }

describe('buildCommandLine', () => {
  it('builds add lines in both dialects', () => {
    expect(buildCommandLine({ id: 5, kind: 'add_user', pin: '12', name: 'Akhil P', dialect: 'privilege' }))
      .toBe('C:5:DATA UPDATE USERINFO PIN=12\tName=Akhil P\tPrivilege=0\tCard=')
    expect(buildCommandLine({ id: 5, kind: 'add_user', pin: '12', name: 'Akhil P', dialect: 'pri' }))
      .toBe('C:5:DATA UPDATE USERINFO PIN=12\tName=Akhil P\tPri=0\tCard=')
  })
  it('builds a remove line', () => {
    expect(buildCommandLine({ id: 9, kind: 'remove_user', pin: '12', dialect: 'privilege' })).toBe('C:9:DATA DELETE USERINFO PIN=12')
  })
  it('strips tabs, newlines, equals, NUL and controls from names, collapses spaces and caps at 24', () => {
    expect(sanitizeName('A\tB\r\nC=D\u0000E\u0007F')).toBe('A B C D E F')
    expect(sanitizeName('  a    b  ')).toBe('a b')
    expect(sanitizeName('x'.repeat(40))).toHaveLength(24)
    const line = buildCommandLine({ id: 1, kind: 'add_user', pin: '1', name: 'Bad\tPrivilege=14\nShell', dialect: 'privilege' })
    expect(line).toBe('C:1:DATA UPDATE USERINFO PIN=1\tName=Bad Privilege 14 Shell\tPrivilege=0\tCard=')
    expect(line.split('\t')).toHaveLength(4)
    expect(line).not.toMatch(/[\r\n\u0000]/)
  })
  it('rejects an invalid pin', () => {
    for (const pin of ['', 'abc', '1234567890', '1;2', '-1', '1 2']) {
      expect(() => buildCommandLine({ id: 1, kind: 'remove_user', pin, dialect: 'privilege' })).toThrow()
    }
  })
})

describe('enqueueDeviceCommand', () => {
  it('queues, stores a sanitized name and skips a duplicate queued or sent command', async () => {
    const db = createFakeDb()
    expect(await enqueueDeviceCommand(asDb(db), { ...base, kind: 'add_user', pin: '7', name: 'A=B' })).toEqual({ queued: true })
    expect(db.tables.device_commands[0]).toMatchObject({ pin: '7', state: 'queued', payload: { name: 'A B' } })
    expect(await enqueueDeviceCommand(asDb(db), { ...base, kind: 'add_user', pin: '7', name: 'A' })).toEqual({ queued: false, reason: 'duplicate' })
    db.tables.device_commands[0].state = 'sent'
    expect(await enqueueDeviceCommand(asDb(db), { ...base, kind: 'add_user', pin: '7' })).toEqual({ queued: false, reason: 'duplicate' })
    db.tables.device_commands[0].state = 'done'
    expect((await enqueueDeviceCommand(asDb(db), { ...base, kind: 'add_user', pin: '7' })).queued).toBe(true)
  })
  it('refuses at 100 pending commands per device', async () => {
    const db = createFakeDb()
    for (let i = 0; i < 100; i++) db.tables.device_commands.push({ id: i + 1, device_id: 'dev1', kind: 'add_user', pin: String(i + 1000), state: i % 2 ? 'sent' : 'queued' })
    expect(await enqueueDeviceCommand(asDb(db), { ...base, kind: 'add_user', pin: '5' })).toEqual({ queued: false, reason: 'cap' })
    expect((await enqueueDeviceCommand(asDb(db), { ...base, deviceId: 'dev2', kind: 'add_user', pin: '5' })).queued).toBe(true)
  })
})

describe('claimNextCommands / ackCommands', () => {
  const row = (o: Record<string, unknown>) => ({ device_id: 'dev1', kind: 'add_user', pin: '7', payload: { name: 'Ann' }, state: 'queued', attempts: 0, last_sent_at: null, ...o })

  it('claims up to 5 queued commands as sent and builds lines with the dialect', async () => {
    const db = createFakeDb()
    for (let i = 1; i <= 7; i++) db.tables.device_commands.push(row({ id: i }))
    db.tables.device_commands.push(row({ id: 99, device_id: 'other' }))
    const out = await claimNextCommands(asDb(db), 'dev1', 'pri', NOW)
    expect(out.map(c => c.id)).toEqual([1, 2, 3, 4, 5])
    expect(out[0].line).toBe('C:1:DATA UPDATE USERINFO PIN=7\tName=Ann\tPri=0\tCard=')
    expect(db.tables.device_commands[0]).toMatchObject({ state: 'sent', attempts: 1, last_sent_at: NOW.toISOString() })
    expect(db.tables.device_commands[6].state).toBe('queued')
    expect(db.tables.device_commands[7].state).toBe('queued')
  })

  it('re-offers a sent command after 60 s but not before', async () => {
    const db = createFakeDb()
    db.tables.device_commands.push(row({ id: 1, state: 'sent', attempts: 1, last_sent_at: new Date(NOW.getTime() - 30_000).toISOString() }))
    expect(await claimNextCommands(asDb(db), 'dev1', 'privilege', NOW)).toEqual([])
    const later = new Date(NOW.getTime() + 40_000)
    const out = await claimNextCommands(asDb(db), 'dev1', 'privilege', later)
    expect(out.map(c => c.id)).toEqual([1])
    expect(db.tables.device_commands[0]).toMatchObject({ attempts: 2, last_sent_at: later.toISOString() })
  })

  it('fails a command still unacknowledged after 5 attempts', async () => {
    const db = createFakeDb()
    db.tables.device_commands.push(row({ id: 1, state: 'sent', attempts: 5, last_sent_at: new Date(NOW.getTime() - 61_000).toISOString() }))
    expect(await claimNextCommands(asDb(db), 'dev1', 'privilege', NOW)).toEqual([])
    expect(db.tables.device_commands[0]).toMatchObject({ state: 'failed', error: 'no acknowledgement' })
  })

  it('acks success and negative results only for this device and open commands', async () => {
    const db = createFakeDb()
    db.tables.device_commands.push(
      row({ id: 1, state: 'sent' }), row({ id: 2, state: 'sent' }), row({ id: 3, state: 'done' }), row({ id: 4, state: 'sent', device_id: 'other' }),
    )
    const res = await ackCommands(asDb(db), 'dev1', [{ id: 1, ret: 0 }, { id: 2, ret: -3 }, { id: 3, ret: 0 }, { id: 4, ret: 0 }, { id: 404, ret: 0 }], NOW)
    expect(res).toEqual({ updated: 2 })
    expect(db.tables.device_commands[0]).toMatchObject({ state: 'done', acked_at: NOW.toISOString() })
    expect(db.tables.device_commands[1]).toMatchObject({ state: 'failed', error: 'device returned -3' })
    expect(db.tables.device_commands[3].state).toBe('sent')
  })
})

describe('enqueueMemberDeviceSync', () => {
  function setup() {
    const db = createFakeDb()
    db.tables.attendance_devices.push(
      { id: 'dev1', gym_id: 'gym1', is_active: true }, { id: 'dev2', gym_id: 'gym1', is_active: false }, { id: 'devX', gym_id: 'gym2', is_active: true },
    )
    db.tables.members.push({ id: 'mem1', gym_id: 'gym1', name: 'Ann', member_number: 42 })
    return db
  }
  it('queues add on active devices of the gym only and pre-maps the pin', async () => {
    const db = setup()
    expect(await enqueueMemberDeviceSync(asDb(db), { gymId: 'gym1', memberId: 'mem1', action: 'add' })).toEqual({ queued: 1 })
    expect(db.tables.device_commands).toHaveLength(1)
    expect(db.tables.device_commands[0]).toMatchObject({ device_id: 'dev1', gym_id: 'gym1', kind: 'add_user', pin: '42', payload: { name: 'Ann' } })
    expect(db.tables.device_user_map[0]).toMatchObject({ device_id: 'dev1', pin: '42', member_id: 'mem1', gym_id: 'gym1' })
    // already mapped on that device: nothing more to add
    expect(await enqueueMemberDeviceSync(asDb(db), { gymId: 'gym1', memberId: 'mem1', action: 'add' })).toEqual({ queued: 0 })
  })
  it('queues remove for the member number and mapped pins, then drops the map rows', async () => {
    const db = setup()
    db.tables.device_user_map.push({ device_id: 'dev1', gym_id: 'gym1', pin: '9', member_id: 'mem1' })
    expect(await enqueueMemberDeviceSync(asDb(db), { gymId: 'gym1', memberId: 'mem1', action: 'remove' })).toEqual({ queued: 2 })
    expect(db.tables.device_commands.map(c => c.pin).sort()).toEqual(['42', '9'])
    expect(db.tables.device_commands.every(c => c.kind === 'remove_user')).toBe(true)
    expect(db.tables.device_user_map).toHaveLength(0)
  })
  it('ignores a member of another gym and never throws', async () => {
    const db = setup()
    expect(await enqueueMemberDeviceSync(asDb(db), { gymId: 'gym2', memberId: 'mem1', action: 'add' })).toEqual({ queued: 0 })
    db.failOn = t => t === 'attendance_devices'
    expect(await enqueueMemberDeviceSync(asDb(db), { gymId: 'gym1', memberId: 'mem1', action: 'add' })).toEqual({ queued: 0 })
  })
})

describe('queueExpiredMemberRemovals', () => {
  it('removes only members whose latest membership ended before today (IST)', async () => {
    const db = createFakeDb()
    db.tables.attendance_devices.push({ id: 'dev1', gym_id: 'gym1', is_active: true })
    db.tables.device_user_map.push(
      { gym_id: 'gym1', device_id: 'dev1', pin: '1', member_id: 'expired' },
      { gym_id: 'gym1', device_id: 'dev1', pin: '2', member_id: 'renewed' },
      { gym_id: 'gym1', device_id: 'dev1', pin: '3', member_id: 'today' },
      { gym_id: 'gym1', device_id: 'dev1', pin: '4', member_id: 'nomembership' },
    )
    db.tables.memberships.push(
      { member_id: 'expired', end_date: '2026-11-01' },
      { member_id: 'renewed', end_date: '2026-10-01' }, { member_id: 'renewed', end_date: '2026-12-01' },
      { member_id: 'today', end_date: '2026-11-09' },
    )
    expect(await queueExpiredMemberRemovals(asDb(db), NOW)).toEqual({ queued: 1 })
    expect(db.tables.device_commands).toHaveLength(1)
    expect(db.tables.device_commands[0]).toMatchObject({ kind: 'remove_user', pin: '1', member_id: 'expired' })
    expect(db.tables.device_user_map.map(m => m.pin)).toEqual(['2', '3', '4'])
    // second run does not re-queue
    expect(await queueExpiredMemberRemovals(asDb(db), NOW)).toEqual({ queued: 0 })
  })
})
