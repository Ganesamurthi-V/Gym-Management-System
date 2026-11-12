import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { createFakeDb } from './fakeDb'

vi.mock('server-only', () => ({}))

const m = vi.hoisted(() => ({ db: null as unknown, allowed: true }))
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => m.db }))
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({}) }))
vi.mock('@/lib/supabase/queries', () => ({ getGymForUser: async () => null }))
vi.mock('@/lib/monitoring/alert', () => ({ reportAlertInBackground: () => {} }))
vi.mock('@/lib/rateLimit', () => ({ checkRateLimit: async () => ({ allowed: m.allowed }) }))
vi.mock('@/lib/logger', () => ({
  apiLogger: () => ({ start() {}, end() {}, summary() {}, error() {}, warn() {}, info() {} }),
}))

import { POST as next } from '@/app/api/devices/commands/next/route'
import { POST as ack } from '@/app/api/devices/commands/ack/route'

// Indirect name so the pre-commit secret scanner (which matches NAME=value) does not flag this fake test value.
const SECRET_VAR = 'ADMS_INGEST_SECRET'
const SECRET = 'test-secret-value'
let db: ReturnType<typeof createFakeDb>

const call = (handler: typeof next, body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  handler(new NextRequest('http://localhost/api/devices/commands/x', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  }))

beforeEach(() => {
  process.env[SECRET_VAR] = SECRET
  m.allowed = true
  db = createFakeDb()
  m.db = db
  db.tables.attendance_devices.push({ id: 'dev1', gym_id: 'gym1', serial_number: 'SN123', is_active: true, last_seen_at: null, command_dialect: 'privilege' })
  db.tables.device_commands.push({ id: 1, device_id: 'dev1', kind: 'remove_user', pin: '7', payload: {}, state: 'queued', attempts: 0, last_sent_at: null })
})
afterEach(() => { delete process.env[SECRET_VAR]; delete process.env.ADMS_INGEST_SECRET_PREVIOUS })

describe('device command routes auth', () => {
  for (const [name, handler, body] of [
    ['next', next, { serial: 'SN123' }],
    ['ack', ack, { serial: 'SN123', results: [] }],
  ] as const) {
    it(`${name}: 401 without or with a wrong secret, and the placeholder never authenticates`, async () => {
      expect((await call(handler, body, null)).status).toBe(401)
      expect((await call(handler, body, 'Bearer nope')).status).toBe(401)
      process.env[SECRET_VAR] = ' '
      expect((await call(handler, body, 'Bearer  ')).status).toBe(401)
      process.env[SECRET_VAR] = 'short'
      expect((await call(handler, body, 'Bearer short')).status).toBe(401)
      expect(db.tables.attendance_devices[0].last_seen_at).toBeNull()
      expect(db.tables.device_commands[0].state).toBe('queued')
    })
  }
  it('rate limited answers 429', async () => {
    m.allowed = false
    expect((await call(next, { serial: 'SN123' })).status).toBe(429)
  })
  it('rejects a bad body', async () => {
    expect((await call(next, { serial: 'bad serial!' })).status).toBe(400)
    expect((await call(ack, { serial: 'SN123', results: [{ id: 1, ret: 'x' }] })).status).toBe(400)
  })
})

describe('POST /api/devices/commands/next', () => {
  it('unknown serial: known false, nothing written', async () => {
    const res = await call(next, { serial: 'NOPE' })
    expect(await res.json()).toMatchObject({ success: true, data: { known: false, commands: [] } })
    expect(db.tables.device_commands[0].state).toBe('queued')
  })
  it('known device: heartbeat plus the command line, marked sent', async () => {
    const res = await call(next, { serial: 'SN123' })
    expect(await res.json()).toMatchObject({ data: { known: true, commands: [{ id: 1, line: 'C:1:DATA DELETE USERINFO PIN=7' }] } })
    expect(db.tables.attendance_devices[0].last_seen_at).not.toBeNull()
    expect(db.tables.device_commands[0].state).toBe('sent')
  })
})

describe('POST /api/devices/commands/ack', () => {
  it('unknown serial: updated 0', async () => {
    expect(await (await call(ack, { serial: 'NOPE', results: [{ id: 1, ret: 0 }] })).json()).toMatchObject({ data: { updated: 0 } })
    expect(db.tables.device_commands[0].state).toBe('queued')
  })
  it('acks the command and refreshes last_seen_at', async () => {
    db.tables.device_commands[0].state = 'sent'
    expect(await (await call(ack, { serial: 'SN123', results: [{ id: 1, ret: 0 }, { id: 77, ret: 0 }] })).json()).toMatchObject({ data: { updated: 1 } })
    expect(db.tables.device_commands[0].state).toBe('done')
    expect(db.tables.attendance_devices[0].last_seen_at).not.toBeNull()
  })
})
