/**
 * Name masking (lib/gamification/maskName.ts) — what one member sees of
 * another on a leaderboard. Mirrors the SQL function gamification_mask_name.
 */

import { describe, it, expect } from 'vitest'
import { maskName } from '@/lib/gamification/maskName'

describe('maskName', () => {
  it('keeps the first name and the initial of the last name', () => {
    expect(maskName('Akhil Prasad')).toBe('Akhil P.')
  })

  it('leaves a single-word name unchanged, without changing its case', () => {
    expect(maskName('AKHIL')).toBe('AKHIL')
    expect(maskName('akhil')).toBe('akhil')
  })

  it('trims and collapses extra spaces', () => {
    expect(maskName('  Akhil   Prasad  ')).toBe('Akhil P.')
    expect(maskName('Akhil\tPrasad')).toBe('Akhil P.')
    expect(maskName('  AKHIL  ')).toBe('AKHIL')
  })

  it('uses the LAST word for the initial in three-word names', () => {
    expect(maskName('Akhil Kumar Prasad')).toBe('Akhil P.')
    expect(maskName('Mohammed Abdul Rahman Khan')).toBe('Mohammed K.')
  })

  it('does not apply initcap', () => {
    expect(maskName('akhil prasad')).toBe('akhil p.')
    expect(maskName('AKHIL PRASAD')).toBe('AKHIL P.')
  })

  it('handles a last name that is already an initial', () => {
    expect(maskName('Ravi K')).toBe('Ravi K.')
    expect(maskName('Ravi K.')).toBe('Ravi K.')
  })

  it('takes a whole code point for non-Latin names', () => {
    expect(maskName('அகில் பிரசாத்')).toBe('அகில் ப.')
  })

  it('returns an empty string for empty input', () => {
    expect(maskName('')).toBe('')
    expect(maskName('   ')).toBe('')
    expect(maskName(null)).toBe('')
    expect(maskName(undefined)).toBe('')
  })

  it('never returns the full last name', () => {
    expect(maskName('Akhil Prasad')).not.toContain('Prasad')
  })
})
