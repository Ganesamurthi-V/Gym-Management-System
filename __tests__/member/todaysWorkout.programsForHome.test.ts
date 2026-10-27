import { describe, expect, it } from 'vitest'
import { programsForHome } from '@/lib/member/todays-workout'

const progs = [
  { id: 'a', name: 'A', schedule: {} },
  { id: 'b', name: 'B', schedule: {} },
]

describe('programsForHome', () => {
  it('keeps only the chosen program when several are assigned', () => {
    expect(programsForHome(progs, 'b').map(p => p.id)).toEqual(['b'])
  })
  it('falls back to all programs for no choice or a stale id', () => {
    expect(programsForHome(progs, undefined)).toHaveLength(2)
    expect(programsForHome(progs, 'gone')).toHaveLength(2)
  })
  it('ignores the choice with a single program', () => {
    expect(programsForHome([progs[0]], 'zzz')).toHaveLength(1)
  })
})
