import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toggleAttendance } from '@/lib/attendance/toggle'
import { DEFAULT_DEVICE_TZ, DUPLICATE_WINDOW_MS, deviceLocalToInstant, isStale, isValidTimeZone, istDateOf, sessionOf } from '@/lib/devices/time'
import { apiLogger } from '@/lib/logger'

export type PunchInput = { pin: string; time: string; status?: number | null; verify?: number | null }
export type DeviceRow = { id: string; gym_id: string; timezone: string }

type PunchRow = { id: string; pin: string; punched_at: string }
type PunchState = 'applied' | 'unmapped' | 'duplicate' | 'stale' | 'error'

/** A row left in 'processing' longer than this belongs to a request that died; it goes back to 'error' for a retry. */
const PROCESSING_TIMEOUT_MS = 5 * 60 * 1000

const log = apiLogger('DEVICE_PUNCHES')

/**
 * Applies one recorded punch. Returns the state it ended in; 'error' means a DB call failed and the
 * row is left in 'error' (the marker for "not processed yet") so a retry picks it up again.
 * `memberId` is passed by the replay; otherwise it comes from device_user_map.
 */
async function processRow(
  db: SupabaseClient, device: DeviceRow, row: PunchRow, now: Date, memberId?: string, pinMap?: Map<string, string>,
): Promise<PunchState> {
  const at = new Date(row.punched_at)

  const finish = async (state: PunchState, member: string | null): Promise<PunchState> => {
    const { error } = await db.from('device_punches').update({ state, member_id: member }).eq('id', row.id)
    if (error) { log.error('device punch state update failed', error); return 'error' }
    return state
  }

  if (isStale(at, now)) return finish('stale', null)

  let member = memberId
  if (!member && pinMap) {
    // Batch path: the whole batch's pins were loaded in one query.
    member = pinMap.get(row.pin)
    if (!member) return finish('unmapped', null)
  } else if (!member) {
    const { data: map, error } = await db
      .from('device_user_map').select('member_id').eq('device_id', device.id).eq('pin', row.pin).maybeSingle()
    if (error) { log.error('device user lookup failed', error); return 'error' }
    if (!map) return finish('unmapped', null)
    member = map.member_id as string
  }

  // A double tap on the reader must not turn a check-in straight into a check-out.
  const { data: recent, error: recentError } = await db
    .from('device_punches').select('id')
    .eq('device_id', device.id).eq('pin', row.pin).eq('state', 'applied')
    .gte('punched_at', new Date(at.getTime() - DUPLICATE_WINDOW_MS).toISOString())
    .lt('punched_at', at.toISOString())
    .limit(1)
  if (recentError) { log.error('device duplicate lookup failed', recentError); return 'error' }
  if (recent && recent.length > 0) return finish('duplicate', member)

  const result = await toggleAttendance(db, {
    gymId: device.gym_id, memberId: member, date: istDateOf(at), session: sessionOf(at), at, source: 'device',
  })
  if (!result.ok) { log.error(`device attendance ${result.step} failed`, result.error); return 'error' }
  return finish(result.action === 'already_out' ? 'duplicate' : 'applied', member)
}

/**
 * Records a batch of punches and applies the new ones. Rows this request inserts are written as
 * 'processing' and so are exclusively its own (the insert ignores conflicts, only new rows come back).
 * Rows stranded in 'error' by an earlier failed attempt are claimed with a conditional UPDATE, so a retry
 * that overlaps a slow first request cannot process the same row twice. Returns failed=true if any DB call
 * failed (the route answers 5xx).
 */
export async function ingestPunches(
  db: SupabaseClient, device: DeviceRow, punches: PunchInput[], now: Date = new Date(),
): Promise<{ accepted: number; failed: boolean }> {
  let tz = device.timezone
  if (!isValidTimeZone(tz)) {
    log.warn('device has an invalid timezone, using Asia/Kolkata', { deviceId: device.id })
    tz = DEFAULT_DEVICE_TZ
  }

  const rows: { gym_id: string; device_id: string; pin: string; punched_at: string; status: number | null; verify_type: number | null; state: PunchState | 'processing'; claimed_at: string | null }[] = []
  for (const p of punches) {
    const at = deviceLocalToInstant(p.time, tz)
    if (!at) { log.warn('device punch with unreadable time skipped'); continue }
    const stale = isStale(at, now)
    rows.push({
      gym_id: device.gym_id, device_id: device.id, pin: p.pin, punched_at: at.toISOString(),
      status: p.status ?? null, verify_type: p.verify ?? null,
      state: stale ? 'stale' : 'processing', claimed_at: stale ? null : now.toISOString(),
    })
  }
  if (rows.length === 0) return { accepted: 0, failed: false }

  // Un-stick rows whose request died mid-way, so the claim below can pick them up.
  const { error: sweepError } = await db
    .from('device_punches').update({ state: 'error' })
    .eq('device_id', device.id).eq('state', 'processing')
    .lt('claimed_at', new Date(now.getTime() - PROCESSING_TIMEOUT_MS).toISOString())
  if (sweepError) { log.error('device punch sweep failed', sweepError); return { accepted: 0, failed: true } }

  const { data: inserted, error: insertError } = await db
    .from('device_punches')
    .upsert(rows, { onConflict: 'device_id,pin,punched_at', ignoreDuplicates: true })
    .select('id, pin, punched_at, state')
  if (insertError) { log.error('device punch insert failed', insertError); return { accepted: 0, failed: true } }
  const mine = ((inserted ?? []) as (PunchRow & { state: string })[]).filter(r => r.state === 'processing')

  const times = rows.map(r => r.punched_at).sort()
  const { data: stranded, error: strandedError } = await db
    .from('device_punches').select('id')
    .eq('device_id', device.id).eq('state', 'error')
    .in('pin', [...new Set(rows.map(r => r.pin))])
    .gte('punched_at', times[0]).lte('punched_at', times[times.length - 1])
  if (strandedError) { log.error('device punch pending lookup failed', strandedError); return release(db, mine) }

  let claimed: PunchRow[] = []
  const strandedIds = (stranded ?? []).map(r => r.id as string)
  if (strandedIds.length > 0) {
    // Only rows still in 'error' come back, so two overlapping requests never share a row.
    const { data, error } = await db
      .from('device_punches').update({ state: 'processing', claimed_at: now.toISOString() })
      .in('id', strandedIds).eq('state', 'error')
      .select('id, pin, punched_at')
    if (error) { log.error('device punch claim failed', error); return release(db, mine) }
    claimed = (data ?? []) as PunchRow[]
  }

  const work = [...mine, ...claimed].sort((a, b) => (a.punched_at < b.punched_at ? -1 : a.punched_at > b.punched_at ? 1 : 0))
  if (work.length === 0) return { accepted: inserted?.length ?? 0, failed: false }

  // One lookup for the whole batch instead of one per punch.
  const { data: maps, error: mapError } = await db
    .from('device_user_map').select('pin, member_id')
    .eq('device_id', device.id).in('pin', [...new Set(work.map(r => r.pin))])
  if (mapError) { log.error('device user lookup failed', mapError); return release(db, work) }
  const pinMap = new Map((maps ?? []).map(m => [m.pin as string, m.member_id as string]))

  let failed = false
  // Sequential, in time order: each punch depends on the attendance row the previous one wrote.
  for (const row of work) {
    if (await processRow(db, device, row, now, undefined, pinMap) === 'error') {
      failed = true
      await db.from('device_punches').update({ state: 'error' }).eq('id', row.id)
    }
  }
  return { accepted: inserted?.length ?? 0, failed }
}

/** Puts rows this request owns back to 'error' (the retry marker) after a failure before they were processed. */
async function release(db: SupabaseClient, rows: PunchRow[]): Promise<{ accepted: number; failed: boolean }> {
  if (rows.length > 0) {
    const { error } = await db.from('device_punches').update({ state: 'error' }).in('id', rows.map(r => r.id))
    if (error) log.error('device punch release failed', error)
  }
  return { accepted: 0, failed: true }
}

/**
 * Re-applies a pin's 'unmapped' punches once the owner has mapped it to a member. The caller (owner UI
 * action) must already have verified that the device, member and gym belong to the signed-in owner.
 */
export async function replayUnmappedPunches(
  db: SupabaseClient, args: { gymId: string; deviceId: string; pin: string; memberId: string },
): Promise<{ applied: number }> {
  const { data: device, error: deviceError } = await db
    .from('attendance_devices').select('id, gym_id, timezone').eq('id', args.deviceId).eq('gym_id', args.gymId).maybeSingle()
  if (deviceError) throw new Error(`replay device lookup failed: ${deviceError.message}`)
  if (!device) return { applied: 0 }

  const { data: rows, error } = await db
    .from('device_punches').select('id, pin, punched_at')
    .eq('device_id', args.deviceId).eq('gym_id', args.gymId).eq('pin', args.pin).eq('state', 'unmapped')
    .order('punched_at', { ascending: true })
  if (error) throw new Error(`replay punch lookup failed: ${error.message}`)

  let applied = 0
  const now = new Date()
  for (const row of (rows ?? []) as PunchRow[]) {
    const state = await processRow(db, device as DeviceRow, row, now, args.memberId)
    if (state === 'error') throw new Error('replay stopped: a punch could not be applied')
    if (state === 'applied') applied++
  }
  return { applied }
}
