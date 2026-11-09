'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Fingerprint, Copy, Check, MoreVertical, ChevronDown, Wand2, RefreshCw, BookOpen, Ban, UserMinus, UserPlus } from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  deviceStatus, statusLabel, punchStateChip, formatPunchTimeIST, commandStateChip, commandLabel,
  type DeviceStatus, type ChipTone, type UnmappedPin,
} from '@/lib/devices/ui'
import {
  addDevice, renameDevice, removeDevice, mapPin, autoMatchByMemberNumber, unmapPin,
  removeMemberFromDevice, addMemberToDevice, setMemberBlocked, setCommandDialect,
} from './actions'
import { MemberPicker } from './MemberPicker'

export type MemberOption = { id: string; name: string; memberNumber: number | null }
export type CommandDialect = 'privilege' | 'pri'
export type DeviceRow = { id: string; name: string; serial: string; lastSeenAt: string | null; commandDialect: CommandDialect; unmapped: UnmappedPin[] }
export type LinkedRow = { id: string; deviceId: string; pin: string; memberName: string; memberNumber: number | null; blocked: boolean }
export type CommandRow = { id: string; deviceId: string; kind: string; pin: string; state: string; createdAt: string }
export type PunchRow = { id: string; pin: string; punchedAt: string; state: string; memberName: string | null }

const POLL_MS = 15_000

const STATUS_TONE: Record<DeviceStatus, string> = {
  connected: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  waiting: 'bg-amber-50 text-amber-700 border-amber-200',
  offline: 'bg-slate-100 text-slate-600 border-slate-200',
}
/** The serial is the only credential, so the card shows just the last 4 characters. */
function maskSerial(serial: string): string {
  return serial.length <= 4 ? serial : `•••• ${serial.slice(-4)}`
}

const CHIP_TONE: Record<ChipTone, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  amber: 'bg-amber-50 text-amber-700 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
  red: 'bg-red-50 text-red-700 border-red-200',
}

function Section({ n, title, children, className }: { n: number; title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn('card bg-surface-card border-surface-border p-4 space-y-3', className)}>
      <h2 className="flex items-center gap-2.5 text-base font-semibold text-slate-900">
        <span className="w-6 h-6 rounded-full bg-brand-500 text-white text-xs font-bold flex items-center justify-center">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

function CopyField({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-xl border border-surface-border bg-surface-secondary px-3 py-2">
      <div className="min-w-0">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="text-sm font-semibold text-slate-900 break-all">{value}</p>
      </div>
      <button
        type="button"
        aria-label={`Copy ${label}`}
        className="shrink-0 w-11 h-11 flex items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
        onClick={async () => {
          try { await navigator.clipboard.writeText(value); setCopied(true); setTimeout(() => setCopied(false), 1500) } catch { /* clipboard blocked */ }
        }}
      >
        {copied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
      </button>
    </div>
  )
}

function AddDeviceForm() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [name, setName] = useState('')
  const [serial, setSerial] = useState('')
  const [tz, setTz] = useState('Asia/Kolkata')
  const [error, setError] = useState<string | null>(null)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    start(async () => {
      const res = await addDevice(name, serial, tz)
      if (!res.ok) { setError(res.error ?? 'Could not add device'); return }
      setName(''); setSerial('')
      router.refresh()
    })
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="dev-name">Device name</label>
        <input id="dev-name" className="input-field" placeholder="Front desk" value={name} onChange={e => setName(e.target.value)} maxLength={60} required />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="dev-serial">Serial number</label>
        <input id="dev-serial" className="input-field uppercase" value={serial} onChange={e => setSerial(e.target.value)} maxLength={64} required autoCapitalize="characters" autoComplete="off" />
        <p className="text-xs text-slate-500 mt-1">On the sticker at the back, or Menu &gt; System Info &gt; Device Info</p>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600 min-h-[44px] flex items-center">Advanced</summary>
        <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="dev-tz">Timezone</label>
        <select id="dev-tz" className="input-field" value={tz} onChange={e => setTz(e.target.value)}>
          <option value="Asia/Kolkata">India (Asia/Kolkata)</option>
          <option value="UTC">UTC</option>
        </select>
      </details>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      <button type="submit" disabled={pending} className="btn-primary">{pending ? 'Adding...' : 'Add device'}</button>
    </form>
  )
}

function DeviceCard({ device, now, serverHost, serverPort, members }: { device: DeviceRow; now: number; serverHost: string | null; serverPort: string | null; members: MemberOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [menu, setMenu] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(device.name)
  const [prevName, setPrevName] = useState(device.name)
  const [error, setError] = useState<string | null>(null)
  // Resync local copy when router.refresh() delivers a new server value.
  if (device.name !== prevName) { setPrevName(device.name); setName(device.name) }

  const status = deviceStatus(device.lastSeenAt, now)

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) => {
    setError(null)
    start(async () => {
      const res = await fn()
      if (!res.ok) { setError(res.error ?? 'Something went wrong'); return }
      after?.()
      router.refresh()
    })
  }

  return (
    <div className="rounded-xl border border-surface-border bg-surface p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{device.name}</p>
          <p className="text-xs text-slate-500 break-all">Serial {maskSerial(device.serial)}</p>
        </div>
        <button type="button" aria-label="Device options" className="w-11 h-11 -mr-2 -mt-2 flex items-center justify-center rounded-lg text-slate-500 active:bg-slate-100" onClick={() => setMenu(v => !v)}>
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span suppressHydrationWarning className={cn('inline-block text-xs font-medium px-2.5 py-1 rounded-full border', STATUS_TONE[status])}>
          {statusLabel(status, device.lastSeenAt, now)}
        </span>
        <button type="button" className="text-xs font-medium text-brand-500 min-h-[44px] px-1" onClick={() => router.refresh()}>Check status</button>
      </div>

      {menu && (
        <div className="rounded-xl border border-surface-border bg-surface-secondary p-3 space-y-2">
          {renaming ? (
            <div className="flex gap-2">
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} maxLength={60} aria-label="Device name" />
              <button type="button" disabled={pending} className="btn-primary !w-auto" onClick={() => run(() => renameDevice(device.id, name), () => { setRenaming(false); setMenu(false) })}>Save</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button type="button" className="btn-secondary" onClick={() => setRenaming(true)}>Rename</button>
              <button
                type="button" disabled={pending}
                className="btn-secondary !text-red-600"
                onClick={() => { if (window.confirm(`Remove "${device.name}"? Members linked to it will be unlinked.`)) run(() => removeDevice(device.id)) }}
              >Remove</button>
            </div>
          )}
        </div>
      )}

      {serverHost && serverPort ? (
        <div className="space-y-2">
          <p className="text-sm text-slate-700">Type these into the device: <span className="font-medium">Menu &gt; Comm &gt; Cloud Server Setting</span></p>
          <CopyField label="Server address" value={serverHost} />
          <CopyField label="Port" value={serverPort} />
        </div>
      ) : (
        <p className="text-sm text-slate-600">The device server address is not ready yet. Your device is saved; it will connect once the address is shown here.</p>
      )}
      <ManageOnDevice device={device} members={members} />
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}

function ManageOnDevice({ device, members }: { device: DeviceRow; members: MemberOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [dialect, setDialect] = useState<CommandDialect>(device.commandDialect)
  const [prevDialect, setPrevDialect] = useState<CommandDialect>(device.commandDialect)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Resync local copy when router.refresh() delivers a new server value.
  if (device.commandDialect !== prevDialect) { setPrevDialect(device.commandDialect); setDialect(device.commandDialect) }

  const add = () => {
    if (!memberId) return
    setMessage(null); setError(null)
    start(async () => {
      const res = await addMemberToDevice(device.id, memberId)
      if (!res.ok) { setError(res.error ?? 'Could not add member'); return }
      setMessage(res.data?.message ?? 'Member will be added to the device.')
      setMemberId(null)
      router.refresh()
    })
  }

  const changeDialect = (value: CommandDialect) => {
    setError(null)
    setDialect(value)
    start(async () => {
      const res = await setCommandDialect(device.id, value)
      if (!res.ok) { setDialect(device.commandDialect); setError(res.error ?? 'Could not save'); return }
      router.refresh()
    })
  }

  return (
    <div className="space-y-1">
      <details className="text-sm">
        <summary className="cursor-pointer font-medium text-slate-700 min-h-[44px] flex items-center">Manage members on the device</summary>
        <div className="space-y-2 pb-2">
          <MemberPicker members={members} value={memberId} onChange={setMemberId} />
          <button type="button" disabled={!memberId || pending} className="btn-secondary" onClick={add}>
            <UserPlus className="w-4 h-4" /> {pending ? 'Adding...' : 'Add to device'}
          </button>
          <p className="text-xs text-slate-500">This creates the member on the device. Enrol their fingerprint or face on the device afterwards.</p>
          {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}
        </div>
      </details>
      <details className="text-sm">
        <summary className="cursor-pointer text-slate-600 min-h-[44px] flex items-center">Advanced</summary>
        <div className="pb-2">
          <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor={`dev-style-${device.id}`}>Command style</label>
          <select id={`dev-style-${device.id}`} className="input-field" value={dialect} disabled={pending} onChange={e => changeDialect(e.target.value as CommandDialect)}>
            <option value="privilege">Standard (recommended)</option>
            <option value="pri">Older devices (use if adding members fails)</option>
          </select>
        </div>
      </details>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </div>
  )
}

function UnmappedRow({ deviceId, row, members }: { deviceId: string; row: UnmappedPin; members: MemberOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const save = () => {
    if (!memberId) return
    setError(null)
    start(async () => {
      const res = await mapPin(deviceId, row.pin, memberId)
      if (!res.ok) { setError(res.error ?? 'Could not save'); return }
      router.refresh()
    })
  }

  return (
    <li className="py-3 space-y-2">
      <p className="text-sm text-slate-900">
        <span className="font-semibold">Device ID {row.pin}</span>
        <span className="text-slate-500"> - punched {row.count} {row.count === 1 ? 'time' : 'times'}, last {formatPunchTimeIST(row.lastPunchedAt)}</span>
      </p>
      <div className="flex gap-2 items-start">
        <div className="flex-1 min-w-0"><MemberPicker members={members} value={memberId} onChange={setMemberId} /></div>
        <button type="button" disabled={!memberId || pending} className="btn-primary !w-auto" onClick={save}>{pending ? '...' : 'Save'}</button>
      </div>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
    </li>
  )
}

function MatchSection({ devices, linked, members }: { devices: DeviceRow[]; linked: LinkedRow[]; members: MemberOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showLinked, setShowLinked] = useState(false)
  const totalUnmapped = devices.reduce((n, d) => n + d.unmapped.length, 0)

  const auto = (deviceId: string) => {
    setMessage(null); setError(null)
    start(async () => {
      const res = await autoMatchByMemberNumber(deviceId)
      if (!res.ok) { setError(res.error ?? 'Could not match'); return }
      const n = res.data?.matched ?? 0
      setMessage(n === 0 ? 'No matching member numbers found.' : `Matched ${n} ${n === 1 ? 'member' : 'members'}.`)
      router.refresh()
    })
  }

  const toggleBlock = (id: string, blocked: boolean) => {
    setMessage(null); setError(null)
    start(async () => {
      const res = await setMemberBlocked(id, blocked)
      if (!res.ok) { setError(res.error ?? 'Could not save'); return }
      router.refresh()
    })
  }

  const removeFromDevice = (id: string, who: string) => {
    if (!window.confirm(`Remove ${who} from the device? Deletes this member from the device. Their fingerprint or face on the device is deleted too, so they must enrol again if you add them back.`)) return
    setMessage(null); setError(null)
    start(async () => {
      const res = await removeMemberFromDevice(id)
      if (!res.ok) { setError(res.error ?? 'Could not remove'); return }
      router.refresh()
    })
  }

  const unlink = (id: string, who: string) => {
    if (!window.confirm(`Unlink ${who}? Their next punch will need matching again.`)) return
    setError(null)
    start(async () => {
      const res = await unmapPin(id)
      if (!res.ok) { setError(res.error ?? 'Could not unlink'); return }
      router.refresh()
    })
  }

  return (
    <>
      {totalUnmapped === 0 ? (
        <p className="text-sm text-slate-600">
          Nothing to match yet. When a member punches on the device for the first time, their Device ID shows up here so you can pick the member.
        </p>
      ) : (
        <>
          <div className="rounded-xl border border-surface-border bg-surface-secondary p-3 space-y-2">
            <p className="text-sm text-slate-700">If you enrolled members using their member number as the Device ID, match them all in one tap.</p>
            {devices.filter(d => d.unmapped.length > 0).map(d => (
              <button key={d.id} type="button" disabled={pending} className="btn-secondary" onClick={() => auto(d.id)}>
                <Wand2 className="w-4 h-4" /> Match automatically by member number{devices.length > 1 ? ` (${d.name})` : ''}
              </button>
            ))}
          </div>
          {devices.filter(d => d.unmapped.length > 0).map(d => (
            <div key={d.id}>
              {devices.length > 1 && <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">{d.name}</p>}
              <ul className="divide-y divide-surface-border">
                {d.unmapped.map(row => <UnmappedRow key={row.pin} deviceId={d.id} row={row} members={members} />)}
              </ul>
            </div>
          ))}
        </>
      )}
      {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}

      <div className="border-t border-surface-border pt-2">
        <button type="button" className="w-full flex items-center justify-between min-h-[44px] text-sm font-medium text-slate-700" onClick={() => setShowLinked(v => !v)} aria-expanded={showLinked}>
          Linked IDs ({linked.length})
          <ChevronDown className={cn('w-4 h-4 transition-transform', showLinked && 'rotate-180')} />
        </button>
        {showLinked && (
          linked.length === 0 ? <p className="text-sm text-slate-500 pb-2">No members linked yet.</p> : (
            <ul className="divide-y divide-surface-border">
              {linked.map(l => (
                <li key={l.id} className="py-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm text-slate-900 min-w-0 truncate">
                      Device ID {l.pin} <span className="text-slate-500">linked to {l.memberName}</span>
                    </p>
                    <button type="button" disabled={pending} className="btn-ghost !text-red-600 shrink-0" onClick={() => unlink(l.id, l.memberName)}>Unlink</button>
                  </div>
                  {l.blocked && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={cn('text-xs font-medium px-2.5 py-1 rounded-full border', CHIP_TONE.red)}>Blocked</span>
                      <span className="text-xs text-slate-500">Punches from this member are ignored.</span>
                    </div>
                  )}
                  <div className="flex gap-2 flex-wrap">
                    <button type="button" disabled={pending} className="btn-secondary !w-auto" onClick={() => toggleBlock(l.id, !l.blocked)}>
                      <Ban className="w-4 h-4" /> {l.blocked ? 'Unblock' : 'Block'}
                    </button>
                    <button type="button" disabled={pending} className="btn-secondary !w-auto !text-red-600" onClick={() => removeFromDevice(l.id, l.memberName)}>
                      <UserMinus className="w-4 h-4" /> Remove from device
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </>
  )
}

function PunchSection({ punches }: { punches: PunchRow[] }) {
  if (punches.length === 0) {
    return <p className="text-sm text-slate-600">No punches yet. Ask a member to punch on the device and it will appear here within a minute.</p>
  }
  return (
    <ul className="divide-y divide-surface-border">
      {punches.map(p => {
        const chip = punchStateChip(p.state)
        return (
          <li key={p.id} className="flex items-center justify-between gap-2 py-2.5">
            <div className="min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{p.memberName ?? `Device ID ${p.pin}`}</p>
              <p className="text-xs text-slate-500">{formatPunchTimeIST(p.punchedAt)}</p>
            </div>
            <span className={cn('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border', CHIP_TONE[chip.tone])}>{chip.label}</span>
          </li>
        )
      })}
    </ul>
  )
}

function CommandSection({ commands, devices }: { commands: CommandRow[]; devices: DeviceRow[] }) {
  const deviceName = new Map(devices.map(d => [d.id, d.name]))
  return (
    <>
      {commands.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing yet. When you add or remove a member on the device, it shows here with its progress.</p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {commands.map(c => {
            const chip = commandStateChip(c.state)
            return (
              <li key={c.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900 truncate">{commandLabel(c.kind, c.pin)}</p>
                  <p className="text-xs text-slate-500">{devices.length > 1 ? `${deviceName.get(c.deviceId) ?? 'Device'} - ` : ''}{formatPunchTimeIST(c.createdAt)}</p>
                </div>
                <span className={cn('shrink-0 text-xs font-medium px-2.5 py-1 rounded-full border', CHIP_TONE[chip.tone])}>{chip.label}</span>
              </li>
            )
          })}
        </ul>
      )}
      <p className="text-xs text-slate-500">
        Adding creates the member record only. The device must be online and connected to receive it. Removing deletes the fingerprint or face on the device. Blocking keeps it.
      </p>
    </>
  )
}

export function BiometricClient({
  devices, linked, punches, commands, members, serverHost, serverPort,
}: {
  devices: DeviceRow[]; linked: LinkedRow[]; punches: PunchRow[]; commands: CommandRow[]; members: MemberOption[]
  serverHost: string | null; serverPort: string | null
}) {
  const router = useRouter()
  const [refreshing, startRefresh] = useTransition()
  const [now, setNow] = useState(() => Date.now())
  const waiting = devices.some(d => deviceStatus(d.lastSeenAt, now) === 'waiting')
  const commandsPending = commands.some(c => c.state === 'queued' || c.state === 'sent')
  const polling = waiting || commandsPending

  // Poll only while a device is waiting for first contact or a command is still queued/sent, and the tab is visible.
  useEffect(() => {
    setNow(Date.now())
    const tick = setInterval(() => {
      if (document.visibilityState !== 'visible') return
      setNow(Date.now())
      if (polling) router.refresh()
    }, POLL_MS)
    return () => clearInterval(tick)
  }, [polling, router])

  const serverReady = !!serverHost && !!serverPort

  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl lg:max-w-5xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Fingerprint className="w-6 h-6 text-brand-500" />
          <h1 className="text-xl font-bold text-slate-900">Biometric</h1>
        </div>
        <div className="flex items-center gap-1">
          {/* Public guide on the marketing site; opens in a new tab so the owner keeps this page open while following the steps. */}
          <a
            href="https://www.gymflow.sbs/biometric-attendance-setup"
            target="_blank"
            rel="noopener noreferrer"
            className="min-h-[44px] px-3 flex items-center gap-1.5 rounded-lg text-sm font-medium text-brand-500 active:bg-slate-100"
          >
            <BookOpen className="w-4 h-4" /> Setup guide
          </a>
          <button
            type="button"
            aria-label="Refresh"
            title="Refresh"
            disabled={refreshing}
            onClick={() => startRefresh(() => router.refresh())}
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-500 active:bg-slate-100"
          >
            <RefreshCw className={cn('w-5 h-5', refreshing && 'animate-spin')} />
          </button>
        </div>
      </div>

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_20rem] lg:gap-5 lg:items-start">
      <div className="space-y-4 md:space-y-5 min-w-0">
      <Section n={1} title="Connect your device">
        {!serverReady && devices.length === 0 && (
          <p className="text-sm text-slate-600">Enter your device serial number below. The server address to type into the device appears here once it is ready.</p>
        )}
        {devices.map(d => <DeviceCard key={d.id} device={d} now={now} serverHost={serverHost} serverPort={serverPort} members={members} />)}
        {devices.length === 0 ? (
          <AddDeviceForm />
        ) : (
          <details className="text-sm">
            <summary className="cursor-pointer font-medium text-slate-700 min-h-[44px] flex items-center">Add another device</summary>
            <AddDeviceForm />
          </details>
        )}
        <details className="text-sm">
          <summary className="cursor-pointer font-medium text-slate-700 min-h-[44px] flex items-center">Help</summary>
          <ol className="list-decimal pl-5 space-y-1 text-slate-600">
            <li>On the device, open Menu &gt; Comm &gt; Cloud Server Setting.</li>
            <li>Enter the Server address and Port shown above.</li>
            <li>If the address is a name, not numbers, turn on Domain Name.</li>
            <li>Save, then restart the device.</li>
            <li>This page shows Connected within a minute or two.</li>
            <li>If your device supports HTTPS, use port 443 instead of 80, because port 80 is not encrypted.</li>
          </ol>
        </details>
      </Section>

      <Section n={2} title="Match members">
        {devices.length === 0
          ? <p className="text-sm text-slate-600">Add your device first. Then match each Device ID to a member here.</p>
          : <MatchSection devices={devices} linked={linked} members={members} />}
      </Section>

      {/* Phones and tablets: full list here. From lg up the side panel below shows the latest 10 instead. */}
      <Section n={3} title="Recent punches" className="lg:hidden">
        <PunchSection punches={punches} />
      </Section>

      <Section n={4} title="Device commands">
        <CommandSection commands={commands} devices={devices} />
      </Section>
      </div>

      <aside className="hidden lg:block lg:sticky lg:top-4">
        <section className="card bg-surface-card border-surface-border p-4 space-y-3">
          <h2 className="text-base font-semibold text-slate-900">Latest punches</h2>
          <PunchSection punches={punches.slice(0, 10)} />
        </section>
      </aside>
      </div>
    </div>
  )
}
