'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { UserPlus, Link as LinkIcon, Unlink, UserMinus, Ban, X, Wand2, Loader2, Check, AlertCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatMemberId } from '@/types'
import { enrolStatus, formatPunchTimeIST } from '@/lib/devices/ui'
import { addMemberToDevice, mapPin, unmapPin, autoMatchByMemberNumber, removeMemberFromDevice, setMemberBlocked } from './actions'
import { MemberPicker } from './MemberPicker'
import type { DeviceRow, LinkedRow, PunchRow, CommandRow, MemberOption } from './BiometricClient'

type Kind = 'enrol' | 'assign' | 'unlink' | 'remove' | 'block'

const ENROL_POLL_MS = 8_000

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  // Escape closes; body scroll is locked so the page behind does not move under the owner's thumb.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev }
  }, [onClose])

  useEffect(() => { if (mounted) ref.current?.focus() }, [mounted])

  if (!mounted) return null
  // Portalled: inside AppShell a fixed overlay would be clipped.
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink-900/60" onClick={onClose}>
      <div
        ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title}
        className="w-full max-w-md max-h-[90vh] overflow-y-auto rounded-2xl border border-surface-border bg-surface-card p-4 space-y-4 outline-none shadow-xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">{title}</h2>
          <button type="button" aria-label="Close" onClick={onClose} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-lg text-slate-500 active:bg-slate-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  )
}

function Feedback({ error, message }: { error: string | null; message: string | null }) {
  return (
    <>
      {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
      {message && <p className="text-sm text-emerald-700" role="status">{message}</p>}
    </>
  )
}

const who = (name: string, n: number | null) => `${name} (${formatMemberId(n)})`

/** Native select of members already linked on this device; used by Remove and Block. */
function LinkedSelect({ rows, value, onChange }: { rows: LinkedRow[]; value: string; onChange: (id: string) => void }) {
  return (
    <select className="input-field" aria-label="Member" value={value} onChange={e => onChange(e.target.value)}>
      <option value="">Choose a member</option>
      {rows.map(l => <option key={l.id} value={l.id}>{who(l.memberName, l.memberNumber)}{l.blocked ? ' - blocked' : ''}</option>)}
    </select>
  )
}

function EnrolDialog({ device, linked, members, commands, punches }: {
  device: DeviceRow; linked: LinkedRow[]; members: MemberOption[]; commands: CommandRow[]; punches: PunchRow[]
}) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [memberId, setMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Held in state so the guided panel survives router.refresh() while the owner walks to the device.
  const [enrolled, setEnrolled] = useState<{ name: string; number: number | null; since: string } | null>(null)

  // Hide members already linked on this device (matched by member number; the map row carries no member id).
  const taken = new Set(linked.filter(l => l.deviceId === device.id).map(l => l.memberNumber))
  const choices = members.filter(m => m.memberNumber === null || !taken.has(m.memberNumber))

  const add = () => {
    const m = members.find(x => x.id === memberId)
    if (!m) return
    setError(null)
    // Backdated 60 s: command timestamps come from the server clock, which may be slightly behind this phone.
    const since = new Date(Date.now() - 60_000).toISOString()
    start(async () => {
      const res = await addMemberToDevice(device.id, m.id)
      if (!res.ok) { setError(res.error ?? 'Could not add member'); return }
      setEnrolled({ name: m.name, number: m.memberNumber, since })
      router.refresh()
    })
  }

  // Poll only while this panel is open and the tab is visible; the dialog stays open between refreshes.
  useEffect(() => {
    if (!enrolled) return
    const t = setInterval(() => { if (document.visibilityState === 'visible') router.refresh() }, ENROL_POLL_MS)
    return () => clearInterval(t)
  }, [enrolled, router])

  if (enrolled) {
    const status = enrolStatus({ pin: String(enrolled.number ?? ''), deviceId: device.id, commands, punches, since: enrolled.since })
    const line = {
      sending: { text: 'Sending to the device...', tone: 'text-slate-600', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      waiting: { text: 'On the device. Waiting for their first punch', tone: 'text-amber-700', icon: <Loader2 className="w-4 h-4 animate-spin" /> },
      enrolled: { text: 'Enrolled. First punch received', tone: 'text-emerald-700', icon: <Check className="w-4 h-4" /> },
      failed: { text: 'Could not reach the device', tone: 'text-red-600', icon: <AlertCircle className="w-4 h-4" /> },
    }[status]
    return (
      <div className="space-y-3">
        <ol className="space-y-1.5 text-sm text-slate-700">
          <li>1. Go to the device.</li>
          <li>2. Open the user menu and find <span className="font-semibold">{enrolled.name}</span> (ID {enrolled.number ?? '-'}).</li>
          <li>3. Enrol their fingerprint or face.</li>
          <li>4. Ask them to punch once to finish.</li>
        </ol>
        <p className={cn('flex items-center gap-2 text-sm font-medium', line.tone)} role="status">{line.icon}{line.text}</p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <MemberPicker members={choices} value={memberId} onChange={setMemberId} />
      <button type="button" disabled={!memberId || pending} className="btn-primary" onClick={add}>
        <UserPlus className="w-4 h-4" /> {pending ? 'Adding...' : 'Add to device'}
      </button>
      <Feedback error={error} message={null} />
    </div>
  )
}

function AssignDialog({ device, members }: { device: DeviceRow; members: MemberOption[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [pin, setPin] = useState<string | null>(null)
  const [memberId, setMemberId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const save = () => {
    if (!pin || !memberId) return
    setError(null); setMessage(null)
    start(async () => {
      const res = await mapPin(device.id, pin, memberId)
      if (!res.ok) { setError(res.error ?? 'Could not save'); return }
      setMessage(`Saved. Device ID ${pin} is linked.`)
      setPin(null); setMemberId(null)
      router.refresh()
    })
  }

  const auto = () => {
    setError(null); setMessage(null)
    start(async () => {
      const res = await autoMatchByMemberNumber(device.id)
      if (!res.ok) { setError(res.error ?? 'Could not match'); return }
      const n = res.data?.matched ?? 0
      setMessage(n === 0 ? 'No matching member numbers found.' : `Matched ${n} ${n === 1 ? 'member' : 'members'}.`)
      router.refresh()
    })
  }

  return (
    <div className="space-y-3">
      {/* Always offered: matching by number is most useful exactly when IDs are waiting. */}
      <div className="space-y-1.5">
        <button type="button" disabled={pending} className="btn-secondary" onClick={auto}>
          <Wand2 className="w-4 h-4" /> {pending ? 'Matching...' : 'Match everyone by member number'}
        </button>
        <p className="text-xs text-slate-500">Works when you enrolled members on the device using their member number as the ID.</p>
      </div>
      {device.unmapped.length === 0 ? (
        <p className="text-sm text-slate-600">Nothing waiting. When someone punches with an ID GymFlow does not know, it shows here.</p>
      ) : (
        <>
          <p className="text-sm text-slate-700">Tap the device ID, then choose the member.</p>
          <ul className="space-y-2">
            {device.unmapped.map(u => (
              <li key={u.pin}>
                <button
                  type="button" aria-pressed={pin === u.pin} onClick={() => setPin(u.pin)}
                  className={cn('w-full text-left min-h-[44px] rounded-xl border px-3 py-2', pin === u.pin ? 'border-brand-500 bg-surface-secondary' : 'border-surface-border bg-surface')}
                >
                  <span className="block text-sm font-semibold text-slate-900">ID {u.pin} punched {u.count} {u.count === 1 ? 'time' : 'times'}</span>
                  <span className="block text-xs text-slate-500">Last {formatPunchTimeIST(u.lastPunchedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
          {pin && <MemberPicker members={members} value={memberId} onChange={setMemberId} />}
          <button type="button" disabled={!pin || !memberId || pending} className="btn-primary" onClick={save}>{pending ? 'Saving...' : 'Save'}</button>
        </>
      )}
      <Feedback error={error} message={message} />
    </div>
  )
}

function UnlinkDialog({ rows }: { rows: LinkedRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mapId, setMapId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const unlink = () => {
    if (!mapId) return
    setError(null); setMessage(null)
    start(async () => {
      const res = await unmapPin(mapId)
      if (!res.ok) { setError(res.error ?? 'Could not unlink'); return }
      setMessage('Unlinked.')
      setMapId('')
      router.refresh()
    })
  }

  if (rows.length === 0) return <p className="text-sm text-slate-600">No members are linked to this device yet.</p>
  return (
    <div className="space-y-3">
      <LinkedSelect rows={rows} value={mapId} onChange={setMapId} />
      <p className="text-sm text-slate-600">Their device ID goes back to Needs matching. They stay on the device and nothing is deleted there. Their past attendance is kept.</p>
      <button type="button" disabled={!mapId || pending} className="btn-secondary" onClick={unlink}>
        <Unlink className="w-4 h-4" /> {pending ? 'Unlinking...' : 'Unlink'}
      </button>
      <Feedback error={error} message={message} />
    </div>
  )
}

function RemoveDialog({ rows }: { rows: LinkedRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mapId, setMapId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  const remove = () => {
    const row = rows.find(r => r.id === mapId)
    if (!row) return
    setError(null); setMessage(null)
    start(async () => {
      const res = await removeMemberFromDevice(row.id)
      if (!res.ok) { setError(res.error ?? 'Could not remove'); return }
      setMessage(`${row.memberName} will be removed from the device.`)
      setMapId('')
      router.refresh()
    })
  }

  if (rows.length === 0) return <p className="text-sm text-slate-600">No members are linked to this device yet.</p>
  return (
    <div className="space-y-3">
      <LinkedSelect rows={rows} value={mapId} onChange={setMapId} />
      <p className="text-sm text-slate-600">Their fingerprint on the device is deleted too. They must enrol again if you add them back.</p>
      <button type="button" disabled={!mapId || pending} className="btn-primary !bg-red-600 !text-white" onClick={remove}>
        <UserMinus className="w-4 h-4" /> {pending ? 'Removing...' : 'Remove from device'}
      </button>
      <Feedback error={error} message={message} />
    </div>
  )
}

function BlockDialog({ rows }: { rows: LinkedRow[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [mapId, setMapId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const row = rows.find(r => r.id === mapId)

  const toggle = () => {
    if (!row) return
    setError(null); setMessage(null)
    const next = !row.blocked
    start(async () => {
      const res = await setMemberBlocked(row.id, next)
      if (!res.ok) { setError(res.error ?? 'Could not save'); return }
      setMessage(next ? `${row.memberName} is now blocked.` : `${row.memberName} is unblocked.`)
      router.refresh()
    })
  }

  if (rows.length === 0) return <p className="text-sm text-slate-600">No members are linked to this device yet.</p>
  return (
    <div className="space-y-3">
      <LinkedSelect rows={rows} value={mapId} onChange={setMapId} />
      {row && (
        <p className="text-sm text-slate-700">
          {row.memberName} is currently <span className={cn('font-semibold', row.blocked ? 'text-red-600' : 'text-emerald-700')}>{row.blocked ? 'blocked' : 'not blocked'}</span>.
        </p>
      )}
      <p className="text-sm text-slate-600">Blocked members can still touch the device, but GymFlow ignores their punches.</p>
      <button type="button" disabled={!row || pending} className="btn-primary" onClick={toggle}>
        <Ban className="w-4 h-4" /> {pending ? 'Saving...' : row?.blocked ? 'Unblock member' : 'Block member'}
      </button>
      <Feedback error={error} message={message} />
    </div>
  )
}

const ACTIONS: { kind: Kind; label: string; hint: string; title: string; icon: typeof UserPlus }[] = [
  { kind: 'enrol', label: 'Enrol a new member', hint: 'Add someone to the device', title: 'Enrol a new member', icon: UserPlus },
  { kind: 'assign', label: 'Assign a device ID to a member', hint: 'Match an unknown ID to a member', title: 'Assign a device ID', icon: LinkIcon },
  { kind: 'unlink', label: 'Unlink a device ID', hint: 'Send an ID back to Needs matching', title: 'Unlink a device ID', icon: Unlink },
  { kind: 'remove', label: 'Remove a member', hint: 'Delete them from the device', title: 'Remove a member', icon: UserMinus },
  { kind: 'block', label: 'Block or unblock a member', hint: 'Stop or allow their punches', title: 'Block or unblock', icon: Ban },
]

export function QuickActions({ devices, linked, punches, commands, members }: {
  devices: DeviceRow[]; linked: LinkedRow[]; punches: PunchRow[]; commands: CommandRow[]; members: MemberOption[]
}) {
  const [open, setOpen] = useState<Kind | null>(null)
  const [deviceId, setDeviceId] = useState<string>('')
  // Falls back to the first device if the chosen one was removed.
  const device = devices.find(d => d.id === deviceId) ?? devices[0]
  const close = () => setOpen(null)
  const current = ACTIONS.find(a => a.kind === open)

  return (
    <section className="card bg-surface-card border-surface-border p-4 space-y-3">
      <h2 className="text-base font-semibold text-slate-900">Quick actions</h2>
      {!device ? (
        <p className="text-sm text-slate-600">Add your device first</p>
      ) : (
        <div className="space-y-2">
          {ACTIONS.map(a => (
            <button
              key={a.kind} type="button" onClick={() => setOpen(a.kind)}
              className="w-full min-h-[56px] flex items-center gap-3 rounded-xl border border-surface-border bg-surface px-3 py-2 text-left active:bg-slate-100"
            >
              <a.icon className="w-5 h-5 shrink-0 text-brand-500" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{a.label}</span>
                <span className="block text-xs text-slate-500">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {device && current && (
        <Modal title={current.title} onClose={close}>
          {devices.length > 1 && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1" htmlFor="qa-device">Device</label>
              <select id="qa-device" className="input-field" value={device.id} onChange={e => setDeviceId(e.target.value)}>
                {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
          )}
          {/* key on device so each dialog resets its picks when the owner switches device. */}
          {open === 'enrol' && <EnrolDialog key={device.id} device={device} linked={linked} members={members} commands={commands} punches={punches} />}
          {open === 'assign' && <AssignDialog key={device.id} device={device} members={members} />}
          {open === 'unlink' && <UnlinkDialog key={device.id} rows={linked.filter(l => l.deviceId === device.id)} />}
          {open === 'remove' && <RemoveDialog key={device.id} rows={linked.filter(l => l.deviceId === device.id)} />}
          {open === 'block' && <BlockDialog key={device.id} rows={linked.filter(l => l.deviceId === device.id)} />}
        </Modal>
      )}
    </section>
  )
}
