import { describe, it, expect } from 'vitest'
import {
  deviceStatus, formatLastSeen, statusLabel, isValidSerial, normalizeSerial,
  punchStateChip, groupUnmapped, pinToMemberNumber, formatPunchTimeIST, commandStateChip, commandLabel,
} from '@/lib/devices/ui'

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
