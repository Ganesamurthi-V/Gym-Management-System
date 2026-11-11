import { createClient } from '@/lib/supabase/server'
import { requireOwnerAccess } from '@/lib/owner/access'
import { groupUnmapped, clockSuspectDeviceIds } from '@/lib/devices/ui'
import { BiometricClient, type DeviceRow, type LinkedRow, type PunchRow, type CommandRow, type MemberOption } from './BiometricClient'

export default async function BiometricPage() {
  const { gym } = await requireOwnerAccess()
  const supabase = await createClient()

  const [devices, maps, unmapped, recent, members, cmds] = await Promise.all([
    supabase.from('attendance_devices')
      .select('id, name, serial_number, timezone, last_seen_at, command_dialect')
      .eq('gym_id', gym.id).order('created_at', { ascending: true }),
    supabase.from('device_user_map')
      .select('id, device_id, pin, blocked, member:members!fk_device_user_map_member_same_gym(name, member_number)')
      .eq('gym_id', gym.id).order('created_at', { ascending: false }).limit(5000),
    // Every punch, any state: an ID the owner unlinked has old "counted" punches, not "unmapped" ones, and must
    // come back as needing a match. Linked IDs are filtered out below.
    supabase.from('device_punches')
      .select('device_id, pin, punched_at')
      .eq('gym_id', gym.id).order('punched_at', { ascending: false }).limit(1000),
    supabase.from('device_punches')
      .select('id, device_id, pin, punched_at, state, created_at')
      .eq('gym_id', gym.id).order('punched_at', { ascending: false }).limit(500), // History dialog lists all of these; the page itself shows the latest 5.
    supabase.from('members')
      .select('id, name, member_number')
      .eq('gym_id', gym.id).order('name', { ascending: true }).limit(3000),
    supabase.from('device_commands')
      .select('id, device_id, kind, pin, state, created_at')
      .eq('gym_id', gym.id).order('created_at', { ascending: false }).limit(100),
  ])

  const failed = [devices, maps, unmapped, recent, members, cmds].find(r => r.error)
  if (failed?.error) throw new Error(`Could not load biometric data: ${failed.error.message}`)

  // Privacy: server-only env, passed as props. Never NEXT_PUBLIC_*.
  const host = process.env.ADMS_PUBLIC_HOST?.trim() || null
  const port = process.env.ADMS_PUBLIC_PORT?.trim() || null

  const memberList: MemberOption[] = (members.data ?? []).map(m => ({
    id: m.id as string, name: m.name as string, memberNumber: m.member_number as number | null,
  }))

  const linked: LinkedRow[] = (maps.data ?? []).map(r => {
    const raw = r.member as unknown
    const m = (Array.isArray(raw) ? raw[0] : raw) as { name: string; member_number: number | null } | null
    return {
      id: r.id as string, deviceId: r.device_id as string, pin: r.pin as string,
      memberName: m?.name ?? 'Member', memberNumber: m?.member_number ?? null,
      blocked: r.blocked === true,
    }
  })

  // The name comes from the CURRENT link for that device ID, not from whoever the punch counted for: unlinking a
  // member takes their name off past punches too, and relinking the ID to someone else shows the new name.
  const nameByDevicePin = new Map(linked.map(l => [`${l.deviceId}:${l.pin}`, l.memberName]))
  const punches: PunchRow[] = (recent.data ?? []).map(p => ({
    id: p.id as string, deviceId: p.device_id as string, pin: p.pin as string, punchedAt: p.punched_at as string, state: p.state as string,
    memberName: nameByDevicePin.get(`${p.device_id}:${p.pin}`) ?? null,
  }))

  const mappedKeys = new Set((maps.data ?? []).map(r => `${r.device_id}:${r.pin}`))
  const unmappedByDevice = groupUnmapped(
    (unmapped.data ?? [])
      .filter(p => !mappedKeys.has(`${p.device_id}:${p.pin}`))
      .map(p => ({ device_id: p.device_id as string, pin: p.pin as string, punched_at: p.punched_at as string })),
  )

  const clockSuspects = clockSuspectDeviceIds((recent.data ?? []).map(p => ({
    deviceId: p.device_id as string, punchedAt: p.punched_at as string,
    createdAt: p.created_at as string, state: p.state as string,
  })))

  const deviceRows: DeviceRow[] = (devices.data ?? []).map(d => ({
    clockSuspect: clockSuspects.has(d.id as string),
    id: d.id as string, name: d.name as string, serial: d.serial_number as string,
    lastSeenAt: (d.last_seen_at as string | null) ?? null,
    commandDialect: d.command_dialect === 'pri' ? 'pri' : 'privilege',
    unmapped: unmappedByDevice.get(d.id as string) ?? [],
  }))

  const commands: CommandRow[] = (cmds.data ?? []).map(c => ({
    id: String(c.id), deviceId: c.device_id as string, kind: c.kind as string, pin: c.pin as string,
    state: c.state as string, createdAt: c.created_at as string,
  }))

  return (
    <BiometricClient
      devices={deviceRows}
      linked={linked}
      punches={punches}
      commands={commands}
      members={memberList}
      serverHost={host}
      serverPort={port}
    />
  )
}
