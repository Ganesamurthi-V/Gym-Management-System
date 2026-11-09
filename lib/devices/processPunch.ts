import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { toggleAttendance } from '@/lib/attendance/toggle'
import { DUPLICATE_WINDOW_MS, deviceLocalToInstant, isStale, istDateOf, sessionOf } from '@/lib/devices/time'
import { apiLogger } from '@/lib/logger'

export type PunchInput = { pin: string; time: string; status?: number | null; verify?: number | null }
export type DeviceRow = { id: string; gym_id: string; timezone: string }

type PunchRow = { id: string; pin: string; punched_at: string }
type PunchState = 'applied' | 'unmapped' | 'duplicate' | 'stale' | 'error'

const log = apiLogger('DEVICE_PUNCHES')

/**
 * Applies one recorded punch. Returns the state it ended in; 'error' means a DB call failed and the
 * row is left in 'error' (the marker for "not processed yet") so a retry picks it up again.
 * `memberId` is passed by the replay; otherwise it comes from device_user_map.
 */
async function processRow(db: SupabaseClient, device: DeviceRow, row: PunchRow, now: Date, memberId?: string): Promise<PunchState> {
  const at = new Date(row.punched_at)

  const finish = async (state: PunchState, member: string | null): Promise<PunchState> => {
    const { error } = await db.from('device_punches').update({ state, member_id: member }).eq('id', row.id)
    if (error) { log.error('device punch state update failed', error); return 'error' }
    return state
  }

  if (isStale(at, now)) return finish('stale', null)

  let member = memberId
  if (!member) {
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
 * Records a batch of punches and applies the new ones. Only rows that were actually inserted count as
 * accepted, so a retried POST never applies a punch twice; rows left in 'error' by an earlier failed
 * attempt are picked up again here. Returns failed=true if any DB call failed (the route answers 5xx).
 */
export async function ingestPunches(
  db: SupabaseClient, device: DeviceRow, punches: PunchInput[], now: Date = new Date(),
): Promise<{ accepted: number; failed: boolean }> {
  const rows: { gym_id: string; device_id: string; pin: string; punched_at: string; status: number | null; verify_type: number | null; state: PunchState }[] = []
  for (const p of punches) {
    const at = deviceLocalToInstant(p.time, device.timezone)
    if (!at) { log.warn('device punch with unreadable time skipped'); continue }
    rows.push({
      gym_id: device.gym_id, device_id: device.id, pin: p.pin, punched_at: at.toISOString(),
      status: p.status ?? null, verify_type: p.verify ?? null,
      // 'error' doubles as "recorded, not processed yet"; processRow moves it on.
      state: isStale(at, now) ? 'stale' : 'error',
    })
  }
  if (rows.length === 0) return { accepted: 0, failed: false }

  const { data: inserted, error: insertError } = await db
    .from('device_punches')
    .upsert(rows, { onConflict: 'device_id,pin,punched_at', ignoreDuplicates: true })
    .select('id')
  if (insertError) { log.error('device punch insert failed', insertError); return { accepted: 0, failed: true } }

  const times = rows.map(r => r.punched_at).sort()
  const { data: pending, error: pendingError } = await db
    .from('device_punches').select('id, pin, punched_at')
    .eq('device_id', device.id).eq('state', 'error')
    .in('pin', [...new Set(rows.map(r => r.pin))])
    .gte('punched_at', times[0]).lte('punched_at', times[times.length - 1])
    .order('punched_at', { ascending: true })
  if (pendingError) { log.error('device punch pending lookup failed', pendingError); return { accepted: 0, failed: true } }

  let failed = false
  // Sequential, in time order: each punch depends on the attendance row the previous one wrote.
  for (const row of (pending ?? []) as PunchRow[]) {
    if (await processRow(db, device, row, now) === 'error') failed = true
  }
  return { accepted: inserted?.length ?? 0, failed }
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
