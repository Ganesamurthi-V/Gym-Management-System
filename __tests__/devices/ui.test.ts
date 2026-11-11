import { describe, it, expect } from 'vitest'
import {
  deviceStatus, formatLastSeen, statusLabel, isValidSerial, normalizeSerial,
  punchStateChip, groupUnmapped, pinToMemberNumber, formatPunchTimeIST, commandStateChip, commandLabel, enrolStatus, clockSuspectDeviceIds,
  filterPunches, filterCommands, deviceConnectionSummary, wantsDeviceSync,
} from '@/lib/devices/ui'

const PUNCHES = [
  { id: '1', pin: '94', deviceId: 'a', state: 'applied', memberName: 'Akhil Prasad' },
  { id: '2', pin: '12', deviceId: 'a', state: 'unmapped', memberName: null },
  { id: '3', pin: '7', deviceId: 'b', state: 'applied', memberName: 'Meera' },
  { id: '4', pin: '8', deviceId: 'b', state: 'processing', memberName: null },
  { id: '5', pin: '9', deviceId: 'b', state: 'error', memberName: null },
]
const ids = (r: { id: string }[]) => r.map(x => x.id)
const all = { query: '', state: 'all' as const, deviceId: 'all' }

describe('filterPunches', () => {
  it('empty query returns everything', () => {
    expect(ids(filterPunches(PUNCHES, { ...all, query: '   ' }))).toEqual(['1', '2', '3', '4', '5'])
  })
  it('matches member name case-insensitively', () => {
    expect(ids(filterPunches(PUNCHES, { ...all, query: 'AKHIL' }))).toEqual(['1'])
  })
  it('matches device ID by number and by "device id 94"', () => {
    expect(ids(filterPunches(PUNCHES, { ...all, query: '94' }))).toEqual(['1'])
    expect(ids(filterPunches(PUNCHES, { ...all, query: 'Device ID 94' }))).toEqual(['1'])
    expect(ids(filterPunches(PUNCHES, { ...all, query: 'device id 12' }))).toEqual(['2'])
  })
  it('filters by state; error also covers processing', () => {
    expect(ids(filterPunches(PUNCHES, { ...all, state: 'applied' }))).toEqual(['1', '3'])
    expect(ids(filterPunches(PUNCHES, { ...all, state: 'error' }))).toEqual(['4', '5'])
  })
  it('filters by device and combines filters', () => {
    expect(ids(filterPunches(PUNCHES, { ...all, deviceId: 'b' }))).toEqual(['3', '4', '5'])
    expect(ids(filterPunches(PUNCHES, { query: 'meera', state: 'applied', deviceId: 'a' }))).toEqual([])
    expect(ids(filterPunches(PUNCHES, { query: 'meera', state: 'applied', deviceId: 'b' }))).toEqual(['3'])
  })
})

describe('filterCommands', () => {
  const CMDS = [
    { id: '1', kind: 'add_user', pin: '12', state: 'queued' },
    { id: '2', kind: 'remove_user', pin: '12', state: 'done' },
    { id: '3', kind: 'add_user', pin: '5', state: 'failed' },
  ]
  it('searches the command label and status label', () => {
    expect(ids(filterCommands(CMDS, { query: 'add member 12', state: 'all' }))).toEqual(['1'])
    expect(ids(filterCommands(CMDS, { query: 'member 12', state: 'all' }))).toEqual(['1', '2'])
    expect(ids(filterCommands(CMDS, { query: 'waiting', state: 'all' }))).toEqual(['1'])
  })
  it('filters by status and combines with the query', () => {
    expect(ids(filterCommands(CMDS, { query: '', state: 'done' }))).toEqual(['2'])
    expect(ids(filterCommands(CMDS, { query: 'add', state: 'failed' }))).toEqual(['3'])
    expect(ids(filterCommands(CMDS, { query: 'remove', state: 'failed' }))).toEqual([])
  })
})

const NOW = Date.parse('2026-11-09T10:00:00Z')
const ago = (ms: number) => new Date(NOW - ms).toISOString()

describe('deviceStatus', () => {
  it('is waiting when never seen', () => expect(deviceStatus(null, NOW)).toBe('waiting'))
  it('is connected within 5 minutes', () => expect(deviceStatus(ago(60_000), NOW)).toBe('connected'))
  it('is offline after 5 minutes', () => expect(deviceStatus(ago(6 * 60_000), NOW)).toBe('offline'))
  it('treats garbage as waiting', () => expect(deviceStatus('nope', NOW)).toBe('waiting'))
})

describe('formatLastSeen / statusLabel', () => {
  it('formats units', () => {
    expect(formatLastSeen(ago(10_000), NOW)).toBe('just now')
    expect(formatLastSeen(ago(5 * 60_000), NOW)).toBe('5 min ago')
    expect(formatLastSeen(ago(3 * 3600_000), NOW)).toBe('3 h ago')
    expect(formatLastSeen(ago(24 * 3600_000), NOW)).toBe('1 day ago')
    expect(formatLastSeen(ago(48 * 3600_000), NOW)).toBe('2 days ago')
    expect(formatLastSeen(null, NOW)).toBe('never')
  })
  it('builds labels', () => {
    expect(statusLabel('connected', ago(120_000), NOW)).toBe('Connected - last seen 2 min ago')
    expect(statusLabel('waiting', null, NOW)).toBe('Waiting for device')
    expect(statusLabel('offline', ago(2 * 3600_000), NOW)).toBe('Offline since 2 h ago')
  })
})

describe('serial', () => {
  it('normalizes and validates', () => {
    expect(normalizeSerial('  abc-123 ')).toBe('ABC-123')
    expect(isValidSerial(' abc_1 ')).toBe(true)
    expect(isValidSerial('')).toBe(false)
    expect(isValidSerial('a b')).toBe(false)
    expect(isValidSerial('x'.repeat(65))).toBe(false)
  })
})

describe('punchStateChip', () => {
  it('maps states', () => {
    expect(punchStateChip('applied')).toEqual({ label: 'Counted', tone: 'emerald' })
    expect(punchStateChip('unmapped').tone).toBe('amber')
    expect(punchStateChip('stale').label).toBe('Too old')
    expect(punchStateChip('blocked').tone).toBe('red')
    expect(punchStateChip('weird').label).toBe('Error')
  })
})

describe('groupUnmapped', () => {
  it('counts per pin and keeps the latest time', () => {
    const m = groupUnmapped([
      { device_id: 'd1', pin: '12', punched_at: '2026-11-09T01:00:00Z' },
      { device_id: 'd1', pin: '12', punched_at: '2026-11-09T03:00:00Z' },
      { device_id: 'd1', pin: '5', punched_at: '2026-11-09T02:00:00Z' },
      { device_id: 'd2', pin: '12', punched_at: '2026-11-09T01:00:00Z' },
    ])
    expect(m.get('d1')).toEqual([
      { pin: '12', count: 2, lastPunchedAt: '2026-11-09T03:00:00Z' },
      { pin: '5', count: 1, lastPunchedAt: '2026-11-09T02:00:00Z' },
    ])
    expect(m.get('d2')?.length).toBe(1)
  })
})

describe('pinToMemberNumber', () => {
  it('parses numeric pins only', () => {
    expect(pinToMemberNumber('007')).toBe(7)
    expect(pinToMemberNumber('12')).toBe(12)
    expect(pinToMemberNumber('0')).toBeNull()
    expect(pinToMemberNumber('A12')).toBeNull()
    expect(pinToMemberNumber('')).toBeNull()
  })
})

describe('formatPunchTimeIST', () => {
  it('uses IST', () => {
    expect(formatPunchTimeIST('2026-11-09T00:00:00Z')).toContain('5:30')
  })
})

describe('commandStateChip / commandLabel', () => {
  it('maps states to plain words', () => {
    expect(commandStateChip('queued')).toEqual({ label: 'Waiting for device', tone: 'slate' })
    expect(commandStateChip('sent')).toEqual({ label: 'Sent', tone: 'amber' })
    expect(commandStateChip('done')).toEqual({ label: 'Done', tone: 'emerald' })
    expect(commandStateChip('failed')).toEqual({ label: 'Failed, try again', tone: 'red' })
    expect(commandStateChip('weird').tone).toBe('red')
  })
  it('labels commands', () => {
    expect(commandLabel('add_user', '12')).toBe('Add member 12')
    expect(commandLabel('remove_user', '012')).toBe('Remove member 12')
    expect(commandLabel('remove_user', 'AB1')).toBe('Remove member AB1')
  })
  it('keeps the blocked punch chip', () => expect(punchStateChip('blocked').label).toBe('Blocked'))
})

describe('clockSuspectDeviceIds', () => {
  const HOUR = 3600_000
  const future = (dev: string, createdAgo = HOUR, state = 'stale') =>
    ({ deviceId: dev, state, createdAt: ago(createdAgo), punchedAt: new Date(NOW - createdAgo + 2 * HOUR).toISOString() })

  it('flags a device with 2 future-dated stale punches within 24h', () => {
    expect([...clockSuspectDeviceIds([future('d1'), future('d1')], NOW)]).toEqual(['d1'])
  })
  it('ignores a single punch', () => {
    expect(clockSuspectDeviceIds([future('d1')], NOW).size).toBe(0)
  })
  it('ignores stale punches that are simply old', () => {
    const old = { deviceId: 'd1', state: 'stale', createdAt: ago(HOUR), punchedAt: ago(10 * 24 * HOUR) }
    expect(clockSuspectDeviceIds([old, old], NOW).size).toBe(0)
  })
  it('ignores future-dated punches in other states', () => {
    expect(clockSuspectDeviceIds([future('d1', HOUR, 'applied'), future('d1', HOUR, 'error')], NOW).size).toBe(0)
  })
  it('ignores punches created more than 24h ago', () => {
    expect(clockSuspectDeviceIds([future('d1', 25 * HOUR), future('d1', 30 * HOUR)], NOW).size).toBe(0)
  })
  it('handles multiple devices', () => {
    const r = clockSuspectDeviceIds([future('d1'), future('d2'), future('d1'), future('d3'), future('d3')], NOW)
    expect([...r].sort()).toEqual(['d1', 'd3'])
  })
})

describe('enrolStatus', () => {
  const since = '2026-11-09T10:00:00Z'
  const cmd = (state: string, over: Partial<{ deviceId: string; kind: string; pin: string; createdAt: string }> = {}) =>
    ({ deviceId: 'd1', kind: 'add_user', pin: '12', state, createdAt: '2026-11-09T10:00:05Z', ...over })
  const base = { pin: '12', deviceId: 'd1', since }

  it('is sending when no command exists yet', () => {
    expect(enrolStatus({ ...base, commands: [], punches: [] })).toBe('sending')
  })
  it('ignores other devices, kinds, pins and commands older than since', () => {
    const commands = [cmd('done', { deviceId: 'd2' }), cmd('done', { kind: 'remove_user' }), cmd('done', { pin: '13' }), cmd('done', { createdAt: '2026-11-09T09:59:00Z' })]
    expect(enrolStatus({ ...base, commands, punches: [] })).toBe('sending')
  })
  it('is sending while queued or sent', () => {
    expect(enrolStatus({ ...base, commands: [cmd('queued')], punches: [] })).toBe('sending')
    expect(enrolStatus({ ...base, commands: [cmd('sent')], punches: [] })).toBe('sending')
  })
  it('is failed when the command failed', () => {
    expect(enrolStatus({ ...base, commands: [cmd('failed')], punches: [] })).toBe('failed')
  })
  it('is waiting when done and no punch after since', () => {
    const punches = [{ pin: '12', punchedAt: '2026-11-09T09:00:00Z' }, { pin: '99', punchedAt: '2026-11-09T10:30:00Z' }]
    expect(enrolStatus({ ...base, commands: [cmd('done')], punches })).toBe('waiting')
  })
  it('is enrolled when done and the member punched after since', () => {
    expect(enrolStatus({ ...base, commands: [cmd('done')], punches: [{ pin: '012', punchedAt: '2026-11-09T10:30:00Z' }] })).toBe('enrolled')
  })
  it('uses the newest matching command', () => {
    const commands = [cmd('failed'), cmd('done', { createdAt: '2026-11-09T10:05:00Z' })]
    expect(enrolStatus({ ...base, commands, punches: [] })).toBe('waiting')
  })
})

describe('deviceConnectionSummary', () => {
  const on = (lastSeenAt: string | null) => ({ lastSeenAt, isActive: true })
  it('no devices', () => expect(deviceConnectionSummary([], NOW)).toEqual({ hasDevice: false, connected: false }))
  it('only inactive devices count as no device', () =>
    expect(deviceConnectionSummary([{ lastSeenAt: ago(1000), isActive: false }], NOW)).toEqual({ hasDevice: false, connected: false }))
  it('one connected', () => expect(deviceConnectionSummary([on(ago(60_000))], NOW)).toEqual({ hasDevice: true, connected: true }))
  it('one offline', () => expect(deviceConnectionSummary([on(ago(6 * 60_000))], NOW)).toEqual({ hasDevice: true, connected: false }))
  it('one waiting', () => expect(deviceConnectionSummary([on(null)], NOW)).toEqual({ hasDevice: true, connected: false }))
  it('mixed: one connected is enough, inactive connected one is ignored', () => {
    expect(deviceConnectionSummary([on(ago(6 * 60_000)), on(ago(1000))], NOW)).toEqual({ hasDevice: true, connected: true })
    expect(deviceConnectionSummary([on(null), { lastSeenAt: ago(1000), isActive: false }], NOW)).toEqual({ hasDevice: true, connected: false })
  })
})

describe('wantsDeviceSync', () => {
  it('is false only for an explicit false', () => expect(wantsDeviceSync(false)).toBe(false))
  it.each([true, undefined, null, 0, 'false'])('is true for %s', v => expect(wantsDeviceSync(v)).toBe(true))
})
