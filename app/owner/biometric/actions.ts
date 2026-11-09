'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { replayUnmappedPunches } from '@/lib/devices/processPunch'
import { isValidTimeZone } from '@/lib/devices/time'
import { enqueueDeviceCommand } from '@/lib/devices/commands'
import { normalizeSerial, SERIAL_RE, pinToMemberNumber } from '@/lib/devices/ui'

export type ActionResult<T = unknown> = { ok: boolean; error?: string; data?: T }

const uuid = z.string().uuid()
const nameSchema = z.string().trim().min(1, 'Enter a device name').max(60, 'Name is too long')
const pinSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,24}$/, 'Invalid device ID')
const tzSchema = z.string().trim().min(1).max(64)

// The serial is the only credential, so a gym cannot hold many devices or register them in bulk.
const MAX_DEVICES_PER_GYM = 5
const MAX_DEVICES_PER_HOUR = 3

// The gym always comes from the verified session, never from the client.
async function resolveGymId(): Promise<string | null> {
  return (await resolveGymAndUser())?.gymId ?? null
}

async function resolveGymAndUser(): Promise<{ gymId: string; userId: string } | null> {
  const { user } = await getAuthUser()
  if (!user) return null
  const { gym } = await getGymCore(user.id)
  return gym?.id ? { gymId: gym.id, userId: user.id } : null
}

const NOT_SIGNED_IN: ActionResult<never> = { ok: false, error: 'Please sign in again.' }
const GENERIC: ActionResult<never> = { ok: false, error: 'Something went wrong. Please try again.' }

function done<T>(data?: T): ActionResult<T> {
  revalidatePath('/owner/biometric')
  return { ok: true, data }
}

export async function addDevice(name: string, serial: string, timezone?: string): Promise<ActionResult> {
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0].message }
  const normalized = normalizeSerial(serial)
  if (!SERIAL_RE.test(normalized)) {
    return { ok: false, error: 'Serial number can only have letters, numbers, - and _.' }
  }
  const tz = tzSchema.safeParse(timezone || 'Asia/Kolkata')
  if (!tz.success || !isValidTimeZone(tz.data)) {
    return { ok: false, error: 'Unknown timezone. Use a name like Asia/Kolkata.' }
  }

  const ctx = await resolveGymAndUser()
  if (!ctx) return NOT_SIGNED_IN
  const { gymId, userId } = ctx

  const supabase = await createClient()
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
  const [total, recent] = await Promise.all([
    supabase.from('attendance_devices').select('id', { count: 'exact', head: true }).eq('gym_id', gymId),
    supabase.from('attendance_devices').select('id', { count: 'exact', head: true }).eq('gym_id', gymId).gte('created_at', hourAgo),
  ])
  if (total.error || recent.error) return GENERIC
  if ((total.count ?? 0) >= MAX_DEVICES_PER_GYM) {
    return { ok: false, error: 'Device limit reached. Contact support to add more.' }
  }
  if ((recent.count ?? 0) >= MAX_DEVICES_PER_HOUR) {
    return { ok: false, error: 'Too many devices added recently. Please try again later.' }
  }

  const { error } = await supabase.from('attendance_devices').insert({
    gym_id: gymId,
    serial_number: normalized,
    name: parsedName.data,
    timezone: tz.data,
    created_by: userId,
  })
  if (error) {
    // Unique violation. Deliberately does not say whether it is another gym's device.
    if (error.code === '23505') {
      return { ok: false, error: 'This serial number is already registered. Check it and try again.' }
    }
    return GENERIC
  }
  return done()
}

export async function renameDevice(deviceId: string, name: string): Promise<ActionResult> {
  if (!uuid.safeParse(deviceId).success) return GENERIC
  const parsedName = nameSchema.safeParse(name)
  if (!parsedName.success) return { ok: false, error: parsedName.error.issues[0].message }
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { error } = await supabase
    .from('attendance_devices')
    .update({ name: parsedName.data })
    .eq('id', deviceId)
    .eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}

export async function removeDevice(deviceId: string): Promise<ActionResult> {
  if (!uuid.safeParse(deviceId).success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { error } = await supabase
    .from('attendance_devices')
    .delete()
    .eq('id', deviceId)
    .eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}

export async function mapPin(deviceId: string, pin: string, memberId: string): Promise<ActionResult<{ applied: number }>> {
  const p = pinSchema.safeParse(pin)
  if (!uuid.safeParse(deviceId).success || !uuid.safeParse(memberId).success || !p.success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const [dev, mem] = await Promise.all([
    supabase.from('attendance_devices').select('id').eq('id', deviceId).eq('gym_id', gymId).maybeSingle(),
    supabase.from('members').select('id').eq('id', memberId).eq('gym_id', gymId).maybeSingle(),
  ])
  if (dev.error || mem.error) return GENERIC
  if (!dev.data || !mem.data) return { ok: false, error: 'Device or member not found.' }

  const { error } = await supabase.from('device_user_map').insert({
    gym_id: gymId, device_id: deviceId, pin: p.data, member_id: memberId,
  })
  if (error) {
    if (error.code === '23505') return { ok: false, error: 'This device ID is already linked to a member.' }
    return GENERIC
  }

  // Admin client only after both ids are verified against the session gym.
  const replay = await replayUnmappedPunches(createAdminClient(), { gymId, deviceId, pin: p.data, memberId })
  return done({ applied: replay.applied })
}

export async function autoMatchByMemberNumber(deviceId: string): Promise<ActionResult<{ matched: number }>> {
  if (!uuid.safeParse(deviceId).success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { data: dev, error: devErr } = await supabase
    .from('attendance_devices').select('id').eq('id', deviceId).eq('gym_id', gymId).maybeSingle()
  if (devErr) return GENERIC
  if (!dev) return { ok: false, error: 'Device not found.' }

  const [punches, mapped] = await Promise.all([
    // Any state: an unlinked ID's old punches are "applied", not "unmapped". Already-linked pins are skipped below.
    supabase.from('device_punches').select('pin').eq('device_id', deviceId).eq('gym_id', gymId).limit(5000),
    supabase.from('device_user_map').select('pin').eq('device_id', deviceId).eq('gym_id', gymId),
  ])
  if (punches.error || mapped.error) return GENERIC

  const alreadyMapped = new Set((mapped.data ?? []).map(r => r.pin as string))
  const numberToPin = new Map<number, string>()
  for (const r of punches.data ?? []) {
    const pin = r.pin as string
    const n = pinToMemberNumber(pin)
    if (n !== null && !alreadyMapped.has(pin) && !numberToPin.has(n)) numberToPin.set(n, pin)
  }
  if (numberToPin.size === 0) return done({ matched: 0 })

  const { data: members, error: memErr } = await supabase
    .from('members').select('id, member_number').eq('gym_id', gymId).in('member_number', [...numberToPin.keys()])
  if (memErr) return GENERIC

  let matched = 0
  const admin = createAdminClient()
  for (const m of members ?? []) {
    const pin = numberToPin.get(m.member_number as number)
    if (!pin) continue
    const { error } = await supabase.from('device_user_map').insert({
      gym_id: gymId, device_id: deviceId, pin, member_id: m.id,
    })
    if (error) continue
    matched += 1
    await replayUnmappedPunches(admin, { gymId, deviceId, pin, memberId: m.id as string })
  }
  return done({ matched })
}

export async function unmapPin(mapId: string): Promise<ActionResult> {
  if (!uuid.safeParse(mapId).success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { error } = await supabase.from('device_user_map').delete().eq('id', mapId).eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}

const QUEUE_FULL = 'Too many waiting commands for this device. Wait for the device to catch up, then try again.'

export async function removeMemberFromDevice(mapId: string): Promise<ActionResult> {
  if (!uuid.safeParse(mapId).success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { data: row, error: rowErr } = await supabase
    .from('device_user_map').select('id, device_id, pin, member_id').eq('id', mapId).eq('gym_id', gymId).maybeSingle()
  if (rowErr) return GENERIC
  if (!row) return { ok: false, error: 'This member is not linked to the device.' }

  // Admin client only after the row was found through the session client, scoped to the session gym.
  const res = await enqueueDeviceCommand(createAdminClient(), {
    gymId, deviceId: row.device_id as string, memberId: (row.member_id as string | null) ?? null,
    kind: 'remove_user', pin: row.pin as string,
  })
  if (res.reason === 'cap') return { ok: false, error: QUEUE_FULL }

  const { error } = await supabase.from('device_user_map').delete().eq('id', mapId).eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}

export async function addMemberToDevice(deviceId: string, memberId: string): Promise<ActionResult<{ message: string }>> {
  if (!uuid.safeParse(deviceId).success || !uuid.safeParse(memberId).success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const [dev, mem] = await Promise.all([
    supabase.from('attendance_devices').select('id').eq('id', deviceId).eq('gym_id', gymId).maybeSingle(),
    supabase.from('members').select('id, name, member_number').eq('id', memberId).eq('gym_id', gymId).maybeSingle(),
  ])
  if (dev.error || mem.error) return GENERIC
  if (!dev.data || !mem.data) return { ok: false, error: 'Device or member not found.' }
  const number = mem.data.member_number as number | null
  if (!number) return { ok: false, error: 'This member has no member number yet.' }
  const pin = String(number)

  const res = await enqueueDeviceCommand(createAdminClient(), {
    gymId, deviceId, memberId, kind: 'add_user', pin, name: mem.data.name as string,
  })
  if (res.reason === 'cap') return { ok: false, error: QUEUE_FULL }

  // Link now so the first punch matches automatically. A unique violation means it is already linked.
  const { error } = await supabase.from('device_user_map').insert({ gym_id: gymId, device_id: deviceId, pin, member_id: memberId })
  if (error && error.code !== '23505') return GENERIC
  return done({ message: `${mem.data.name} will be added to the device. Now enrol their fingerprint or face on the device.` })
}

export async function setMemberBlocked(mapId: string, blocked: boolean): Promise<ActionResult> {
  if (!uuid.safeParse(mapId).success || typeof blocked !== 'boolean') return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { data: row, error: rowErr } = await supabase
    .from('device_user_map').select('id').eq('id', mapId).eq('gym_id', gymId).maybeSingle()
  if (rowErr) return GENERIC
  if (!row) return { ok: false, error: 'This member is not linked to the device.' }

  const { error } = await createAdminClient().from('device_user_map').update({ blocked }).eq('id', mapId).eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}

export async function setCommandDialect(deviceId: string, dialect: 'privilege' | 'pri'): Promise<ActionResult> {
  const d = z.enum(['privilege', 'pri']).safeParse(dialect)
  if (!uuid.safeParse(deviceId).success || !d.success) return GENERIC
  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { data: dev, error: devErr } = await supabase
    .from('attendance_devices').select('id').eq('id', deviceId).eq('gym_id', gymId).maybeSingle()
  if (devErr) return GENERIC
  if (!dev) return { ok: false, error: 'Device not found.' }

  const { error } = await createAdminClient().from('attendance_devices')
    .update({ command_dialect: d.data }).eq('id', deviceId).eq('gym_id', gymId)
  if (error) return GENERIC
  return done()
}
