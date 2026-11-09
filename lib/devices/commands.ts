import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { apiLogger } from '@/lib/logger'
import { createAdminClient } from '@/lib/supabase/admin'
import { buildCommandLine, sanitizeName, type CommandDialect, type CommandKind } from '@/lib/devices/commandLines'
import { istDateOf } from '@/lib/devices/time'

export type { CommandKind, CommandDialect }

const log = apiLogger('DEVICE_COMMANDS')

/** A device with this many commands waiting is not draining its queue; stop piling more on. */
const MAX_PENDING_PER_DEVICE = 100
const CLAIM_BATCH = 5
const RESEND_AFTER_MS = 60_000
const MAX_ATTEMPTS = 5
const PIN_RE = /^[0-9]{1,9}$/

export async function enqueueDeviceCommand(
  db: SupabaseClient,
  a: { gymId: string; deviceId: string; memberId: string | null; kind: CommandKind; pin: string; name?: string },
): Promise<{ queued: boolean; reason?: 'duplicate' | 'cap' }> {
  const { data: same, error: sameError } = await db
    .from('device_commands').select('id')
    .eq('device_id', a.deviceId).eq('kind', a.kind).eq('pin', a.pin).in('state', ['queued', 'sent']).limit(1)
  if (sameError) throw new Error(`device command lookup failed: ${sameError.message}`)
  if (same && same.length > 0) return { queued: false, reason: 'duplicate' }

  const { data: pending, error: pendingError } = await db
    .from('device_commands').select('id')
    .eq('device_id', a.deviceId).in('state', ['queued', 'sent']).limit(MAX_PENDING_PER_DEVICE)
  if (pendingError) throw new Error(`device command count failed: ${pendingError.message}`)
  if ((pending?.length ?? 0) >= MAX_PENDING_PER_DEVICE) return { queued: false, reason: 'cap' }

  const payload = a.kind === 'add_user' ? { name: sanitizeName(a.name ?? '') || `Member ${a.pin}` } : {}
  const { error } = await db.from('device_commands').insert({
    gym_id: a.gymId, device_id: a.deviceId, member_id: a.memberId, kind: a.kind, pin: a.pin, payload,
  })
  if (error) throw new Error(`device command insert failed: ${error.message}`)
  return { queued: true }
}

type MapLite = { device_id: string; pin: string }

/**
 * Queues add (to every active device that does not already know the member) or remove (the member's number and
 * any mapped pin, then drops the map rows) for one member. Never throws: it runs next to the primary operation.
 */
export async function enqueueMemberDeviceSync(
  db: SupabaseClient, a: { gymId: string; memberId: string; action: 'add' | 'remove' },
): Promise<{ queued: number }> {
  try {
    // Cheapest check first: most gyms have no device, and this runs on every member create/delete.
    const { data: devices, error: devError } = await db
      .from('attendance_devices').select('id').eq('gym_id', a.gymId).eq('is_active', true)
    if (devError) throw new Error(devError.message)
    if (!devices || devices.length === 0) return { queued: 0 }

    const { data: member, error: memberError } = await db
      .from('members').select('id, name, member_number').eq('id', a.memberId).eq('gym_id', a.gymId).maybeSingle()
    if (memberError) throw new Error(memberError.message)
    if (!member) return { queued: 0 }

    const { data: maps, error: mapError } = await db
      .from('device_user_map').select('device_id, pin').eq('gym_id', a.gymId).eq('member_id', a.memberId)
    if (mapError) throw new Error(mapError.message)
    const mapped = (maps ?? []) as MapLite[]

    const numberPin = member.member_number == null ? null : String(member.member_number)
    let queued = 0
    for (const device of devices as { id: string }[]) {
      const myMaps = mapped.filter(m => m.device_id === device.id)
      if (a.action === 'add') {
        if (!numberPin || myMaps.length > 0) continue
        const r = await enqueueDeviceCommand(db, {
          gymId: a.gymId, deviceId: device.id, memberId: a.memberId, kind: 'add_user', pin: numberPin, name: member.name as string,
        })
        if (r.queued) queued++
        // Pre-map the pin so the member's first punch resolves; never overwrites an existing pin owner.
        if (r.queued || r.reason === 'duplicate') {
          const { error } = await db.from('device_user_map').upsert(
            { gym_id: a.gymId, device_id: device.id, pin: numberPin, member_id: a.memberId },
            { onConflict: 'device_id,pin', ignoreDuplicates: true },
          )
          if (error) log.error('device pin pre-map failed', error)
        }
      } else {
        const pins = new Set<string>(myMaps.map(m => m.pin))
        if (numberPin) pins.add(numberPin)
        let allQueued = true
        for (const pin of pins) {
          if (!PIN_RE.test(pin)) continue
          const r = await enqueueDeviceCommand(db, { gymId: a.gymId, deviceId: device.id, memberId: a.memberId, kind: 'remove_user', pin })
          if (r.queued) queued++
          else if (r.reason === 'cap') allQueued = false
        }
        // Keep the map row when the queue is full, so a later run can still remove the user.
        if (allQueued && myMaps.length > 0) {
          const { error } = await db.from('device_user_map').delete().eq('device_id', device.id).eq('member_id', a.memberId)
          if (error) log.error('device map cleanup failed', error)
        }
      }
    }
    return { queued }
  } catch (err) {
    log.error('member device sync failed', err)
    return { queued: 0 }
  }
}

/** Convenience for route hooks: builds the admin client inside the try so a missing env can never fail the caller. */
export async function syncMemberToDevices(gymId: string, memberId: string, action: 'add' | 'remove'): Promise<void> {
  try {
    await enqueueMemberDeviceSync(createAdminClient(), { gymId, memberId, action })
  } catch (err) {
    log.error('member device sync failed', err)
  }
}

type ClaimRow = { id: number; kind: CommandKind; pin: string; payload: { name?: string } | null; attempts: number }

export async function claimNextCommands(
  db: SupabaseClient, deviceId: string, dialect: CommandDialect, now: Date = new Date(),
): Promise<{ id: number; line: string }[]> {
  const nowIso = now.toISOString()
  const cutoff = new Date(now.getTime() - RESEND_AFTER_MS).toISOString()

  // A command offered MAX_ATTEMPTS times without an answer is given up on.
  const { error: failError } = await db
    .from('device_commands').update({ state: 'failed', error: 'no acknowledgement' })
    .eq('device_id', deviceId).eq('state', 'sent').gte('attempts', MAX_ATTEMPTS).lt('last_sent_at', cutoff)
  if (failError) throw new Error(`device command expiry failed: ${failError.message}`)

  const cols = 'id, kind, pin, payload, attempts'
  const claimed: ClaimRow[] = []

  const { data: queued, error: queuedError } = await db
    .from('device_commands').select(cols)
    .eq('device_id', deviceId).eq('state', 'queued').order('id', { ascending: true }).limit(CLAIM_BATCH)
  if (queuedError) throw new Error(`device command lookup failed: ${queuedError.message}`)
  const queuedIds = ((queued ?? []) as ClaimRow[]).map(r => r.id)
  if (queuedIds.length > 0) {
    // Only rows still 'queued' come back, so two overlapping polls never share a command.
    const { data, error } = await db
      .from('device_commands').update({ state: 'sent', attempts: 1, last_sent_at: nowIso })
      .in('id', queuedIds).eq('state', 'queued').select(cols)
    if (error) throw new Error(`device command claim failed: ${error.message}`)
    claimed.push(...((data ?? []) as ClaimRow[]))
  }

  const room = CLAIM_BATCH - claimed.length
  if (room > 0) {
    const { data: stale, error: staleError } = await db
      .from('device_commands').select(cols)
      .eq('device_id', deviceId).eq('state', 'sent').lt('last_sent_at', cutoff).lt('attempts', MAX_ATTEMPTS)
      .order('id', { ascending: true }).limit(room)
    if (staleError) throw new Error(`device command lookup failed: ${staleError.message}`)
    for (const row of (stale ?? []) as ClaimRow[]) {
      // Conditional on the exact attempts and send time just read: a concurrent poll that re-offered it wins.
      const { data, error } = await db
        .from('device_commands').update({ attempts: row.attempts + 1, last_sent_at: nowIso })
        .eq('id', row.id).eq('state', 'sent').eq('attempts', row.attempts).lt('last_sent_at', cutoff).select(cols)
      if (error) throw new Error(`device command re-claim failed: ${error.message}`)
      claimed.push(...((data ?? []) as ClaimRow[]))
    }
  }

  const out: { id: number; line: string }[] = []
  for (const row of claimed.sort((a, b) => a.id - b.id)) {
    try {
      out.push({ id: row.id, line: buildCommandLine({ id: row.id, kind: row.kind, pin: row.pin, name: row.payload?.name, dialect }) })
    } catch (err) {
      // A row that cannot be built (bad pin) must not be offered forever.
      log.error('device command could not be built', err)
      await db.from('device_commands').update({ state: 'failed', error: 'invalid command' }).eq('id', row.id)
    }
  }
  return out
}

export async function ackCommands(
  db: SupabaseClient, deviceId: string, results: { id: number; ret: number }[], now: Date = new Date(),
): Promise<{ updated: number }> {
  let updated = 0
  const okIds = results.filter(r => r.ret >= 0).map(r => r.id)
  if (okIds.length > 0) {
    const { data, error } = await db
      .from('device_commands').update({ state: 'done', acked_at: now.toISOString(), error: null })
      .eq('device_id', deviceId).in('id', okIds).in('state', ['sent', 'queued']).select('id')
    if (error) throw new Error(`device command ack failed: ${error.message}`)
    updated += data?.length ?? 0
  }
  const byRet = new Map<number, number[]>()
  for (const r of results) if (r.ret < 0) byRet.set(r.ret, [...(byRet.get(r.ret) ?? []), r.id])
  for (const [ret, ids] of byRet) {
    const { data, error } = await db
      .from('device_commands').update({ state: 'failed', acked_at: now.toISOString(), error: `device returned ${ret}` })
      .eq('device_id', deviceId).in('id', ids).in('state', ['sent', 'queued']).select('id')
    if (error) throw new Error(`device command ack failed: ${error.message}`)
    updated += data?.length ?? 0
  }
  return { updated }
}

/**
 * Daily step: removes members whose latest membership ended before today (IST) from every device they are
 * mapped on. Returns how many remove commands were queued. Throws on DB errors (the caller isolates it).
 */
export async function queueExpiredMemberRemovals(db: SupabaseClient, now: Date = new Date()): Promise<{ queued: number }> {
  const today = istDateOf(now)
  const { data: devices, error: devError } = await db.from('attendance_devices').select('id, gym_id').eq('is_active', true)
  if (devError) throw new Error(`device list failed: ${devError.message}`)
  if (!devices || devices.length === 0) return { queued: 0 }

  const { data: maps, error: mapError } = await db
    .from('device_user_map').select('gym_id, device_id, pin, member_id').in('device_id', devices.map(d => d.id as string)).limit(5000)
  if (mapError) throw new Error(`device map list failed: ${mapError.message}`)
  const mapRows = (maps ?? []) as { gym_id: string; device_id: string; pin: string; member_id: string }[]
  const memberIds = [...new Set(mapRows.map(m => m.member_id))]

  const latest = new Map<string, string>()
  for (let i = 0; i < memberIds.length; i += 200) {
    const { data, error } = await db
      .from('memberships').select('member_id, end_date').in('member_id', memberIds.slice(i, i + 200))
    if (error) throw new Error(`membership lookup failed: ${error.message}`)
    for (const r of (data ?? []) as { member_id: string; end_date: string | null }[]) {
      if (!r.end_date) continue
      const prev = latest.get(r.member_id)
      if (!prev || r.end_date > prev) latest.set(r.member_id, r.end_date)
    }
  }

  let queued = 0
  for (const m of mapRows) {
    const end = latest.get(m.member_id)
    if (!end || end >= today || !PIN_RE.test(m.pin)) continue
    const r = await enqueueDeviceCommand(db, { gymId: m.gym_id, deviceId: m.device_id, memberId: m.member_id, kind: 'remove_user', pin: m.pin })
    if (r.queued) queued++
    // Drop the map row only once the removal is queued (cap leaves it for tomorrow).
    if (r.queued || r.reason === 'duplicate') {
      const { error } = await db.from('device_user_map').delete().eq('device_id', m.device_id).eq('pin', m.pin)
      if (error) log.error('device map cleanup failed', error)
    }
  }
  return { queued }
}
