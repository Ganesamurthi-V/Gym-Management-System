'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getAuthUser, getGymCore } from '@/lib/dal'
import { replayUnmappedPunches } from '@/lib/devices/processPunch'
import { normalizeSerial, SERIAL_RE, pinToMemberNumber } from '@/lib/devices/ui'

export type ActionResult<T = unknown> = { ok: boolean; error?: string; data?: T }

const uuid = z.string().uuid()
const nameSchema = z.string().trim().min(1, 'Enter a device name').max(60, 'Name is too long')
const pinSchema = z.string().trim().regex(/^[A-Za-z0-9]{1,24}$/, 'Invalid device ID')
const tzSchema = z.string().trim().min(1).max(64)

// The gym always comes from the verified session, never from the client.
async function resolveGymId(): Promise<string | null> {
  const { user } = await getAuthUser()
  if (!user) return null
  const { gym } = await getGymCore(user.id)
  return gym?.id ?? null
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
  if (!tz.success) return { ok: false, error: 'Invalid timezone' }

  const gymId = await resolveGymId()
  if (!gymId) return NOT_SIGNED_IN

  const supabase = await createClient()
  const { error } = await supabase.from('attendance_devices').insert({
    gym_id: gymId,
    serial_number: normalized,
    name: parsedName.data,
    timezone: tz.data,
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
    supabase.from('device_punches').select('pin').eq('device_id', deviceId).eq('gym_id', gymId).eq('state', 'unmapped').limit(5000),
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
