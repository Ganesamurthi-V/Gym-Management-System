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

import { POST } from '@/app/api/devices/punches/route'

const SECRET_VAR = 'ADMS_INGEST_SECRET'
const SECRET = 'test-secret-value'
let db: ReturnType<typeof createFakeDb>

const post = (body: unknown, auth: string | null = `Bearer ${SECRET}`) =>
  POST(new NextRequest('http://localhost/api/devices/punches', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(auth ? { authorization: auth } : {}) },
    body: JSON.stringify(body),
  }))

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-09T05:00:00Z'))
  process.env[SECRET_VAR] = SECRET
  m.allowed = true
  db = createFakeDb()
  m.db = db
  db.tables.attendance_devices.push({ id: 'dev1', gym_id: 'gym1', serial_number: 'SN123', timezone: 'Asia/Kolkata', is_active: true, last_seen_at: null })
  db.tables.device_user_map.push({ device_id: 'dev1', pin: '7', member_id: 'mem1' })
})
afterEach(() => { vi.useRealTimers(); delete process.env[SECRET_VAR]; delete process.env.ADMS_INGEST_SECRET_PREVIOUS })

describe('POST /api/devices/punches', () => {
  it('rejects a missing or wrong secret with 401', async () => {
    expect((await post({ serial: 'SN123', punches: [] }, null)).status).toBe(401)
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer nope')).status).toBe(401)
    expect(db.tables.attendance_devices[0].last_seen_at).toBeNull()
  })
  it('accepts the previous secret during rotation, and ignores an empty one', async () => {
    process.env.ADMS_INGEST_SECRET_PREVIOUS = 'old-secret-0123456789'
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer old-secret-0123456789')).status).toBe(200)
    expect((await post({ serial: 'SN123', punches: [] }, `Bearer ${SECRET}`)).status).toBe(200)
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer wrong')).status).toBe(401)
    process.env.ADMS_INGEST_SECRET_PREVIOUS = ''
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer ')).status).toBe(401)
  })
  it('never lets the single-space placeholder (SST needs one for an unused secret) or a short value authenticate', async () => {
    process.env.ADMS_INGEST_SECRET_PREVIOUS = ' '
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer  ')).status).toBe(401)
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer  x')).status).toBe(401)
    process.env.ADMS_INGEST_SECRET_PREVIOUS = 'short'
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer short')).status).toBe(401)
    process.env[SECRET_VAR] = ' '
    expect((await post({ serial: 'SN123', punches: [] }, 'Bearer  ')).status).toBe(401)
  })
  it('rejects everything when the secret is not configured', async () => {
    delete process.env[SECRET_VAR]
    const res = await post({ serial: 'SN123', punches: [] }, 'Bearer ')
    expect(res.status).toBe(401)
    expect(JSON.stringify(await res.json())).not.toContain(SECRET)
  })
  it('rejects an invalid body with 400', async () => {
    expect((await post({ serial: 'bad serial!', punches: [] })).status).toBe(400)
    expect((await post({ serial: 'SN123', punches: [{ pin: '7', time: 'yesterday' }] })).status).toBe(400)
  })
  it('answers known:false and writes nothing for an unknown or inactive serial', async () => {
    const body = { serial: 'NOPE', punches: [{ pin: '7', time: '2026-11-09 09:00:00' }] }
    const res = await post(body)
    expect(await res.json()).toEqual({ success: true, data: { known: false, accepted: 0 } })
    db.tables.attendance_devices[0].is_active = false
    expect((await (await post({ ...body, serial: 'SN123' })).json()).data).toEqual({ known: false, accepted: 0 })
    expect(db.tables.device_punches).toHaveLength(0)
    expect(db.tables.attendance_devices[0].last_seen_at).toBeNull()
  })
  it('treats an empty punches array as a heartbeat that updates last_seen_at', async () => {
    const res = await post({ serial: 'SN123', punches: [] })
    expect((await res.json()).data).toEqual({ known: true, accepted: 0 })
    expect(db.tables.attendance_devices[0].last_seen_at).toBe('2026-11-09T05:00:00.000Z')
    expect(db.tables.device_punches).toHaveLength(0)
  })
  it('accepts punches, takes the gym from the device row, and applies attendance', async () => {
    const res = await post({ serial: 'SN123', gym_id: 'attacker', punches: [{ pin: '7', time: '2026-11-09 09:00:00', status: 0, verify: 1 }] })
    expect((await res.json()).data).toEqual({ known: true, accepted: 1 })
    expect(db.tables.device_punches[0]).toMatchObject({ gym_id: 'gym1', state: 'applied', member_id: 'mem1', verify_type: 1 })
    expect(db.tables.attendance[0]).toMatchObject({ gym_id: 'gym1', source: 'device' })
  })
  it('returns 500 when a punch cannot be applied so the receiver retries', async () => {
    db.failOn = (t, op) => t === 'attendance' && op === 'insert'
    expect((await post({ serial: 'SN123', punches: [{ pin: '7', time: '2026-11-09 09:00:00' }] })).status).toBe(500)
  })
  it('rate limits by serial', async () => {
    m.allowed = false
    expect((await post({ serial: 'SN123', punches: [] })).status).toBe(429)
  })
})
