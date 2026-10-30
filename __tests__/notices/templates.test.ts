import { describe, it, expect } from 'vitest'
import { NOTICE_TEMPLATES, findPlaceholders, fillPlaceholders, formatNoticeDate, formatNoticeTime, placeholderInput } from '@/lib/notices/templates'
import { NOTICE_KINDS, NOTICE_LIMITS } from '@/types/notice'

const EMOJI = /\p{Extended_Pictographic}/u

describe('notice templates', () => {
  it('has at least 10 templates with unique ids', () => {
    expect(NOTICE_TEMPLATES.length).toBeGreaterThanOrEqual(10)
    expect(new Set(NOTICE_TEMPLATES.map(t => t.id)).size).toBe(NOTICE_TEMPLATES.length)
  })

  for (const t of NOTICE_TEMPLATES) {
    it(`${t.id} fits the limits, has a valid kind, no emoji, and placeholders`, () => {
      expect(NOTICE_KINDS).toContain(t.kind)
      expect(t.title.length).toBeGreaterThanOrEqual(NOTICE_LIMITS.titleMin)
      expect(t.title.length).toBeLessThanOrEqual(NOTICE_LIMITS.titleMax)
      expect(t.body.length).toBeGreaterThanOrEqual(NOTICE_LIMITS.bodyMin)
      expect(t.body.length).toBeLessThanOrEqual(NOTICE_LIMITS.bodyMax)
      expect(EMOJI.test(t.label + t.title + t.body)).toBe(false)
      for (const ph of findPlaceholders(t.title + ' ' + t.body)) expect(placeholderInput(ph.slice(1, -1))).toBe('date')
    })
  }
})

describe('findPlaceholders', () => {
  it('finds distinct bracketed text', () => {
    expect(findPlaceholders('Open [time] to [time] on [date]')).toEqual(['[time]', '[date]'])
  })
  it('returns empty when none', () => {
    expect(findPlaceholders('Gym closed tomorrow')).toEqual([])
  })
})

describe('fillPlaceholders', () => {
  it('replaces all occurrences and trims values', () => {
    expect(fillPlaceholders('On [date] and [date]', { date: ' 2026-11-05 ' })).toBe('On 5 Nov 2026 and 5 Nov 2026')
  })
  it('leaves empty or missing values bracketed', () => {
    expect(fillPlaceholders('[a] [b] [c]', { a: '', b: '   ' })).toBe('[a] [b] [c]')
  })
})

describe('formatters', () => {
  it('formats dates', () => {
    expect(formatNoticeDate('2026-02-21')).toBe('21 Feb 2026')
    expect(formatNoticeDate('2026-02-30')).toBe('')
    expect(formatNoticeDate('nope')).toBe('')
  })
  it('formats times in 12-hour', () => {
    expect(formatNoticeTime('06:00')).toBe('6:00 AM')
    expect(formatNoticeTime('18:30')).toBe('6:30 PM')
    expect(formatNoticeTime('00:15')).toBe('12:15 AM')
    expect(formatNoticeTime('12:00')).toBe('12:00 PM')
    expect(formatNoticeTime('25:00')).toBe('')
  })
  it('fill applies formatters by name and keeps brackets when invalid', () => {
    expect(fillPlaceholders('[from time]-[to time] [resume date] [x]', { 'from time': '06:00', 'to time': '21:00', 'resume date': 'bad', x: 'hi' }))
      .toBe('6:00 AM-9:00 PM [resume date] hi')
  })
  it('picks input type from name', () => {
    expect(placeholderInput('from time')).toBe('time')
    expect(placeholderInput('resume date')).toBe('date')
    expect(placeholderInput('name')).toBe('text')
  })
})

describe('placeholder meanings', () => {
  it('holiday-timings has a date and a resume date, and no time placeholders', () => {
    const t = NOTICE_TEMPLATES.find(x => x.id === 'holiday-timings')!
    expect(t.body).toContain('[date]')
    expect(t.body).toContain('[resume date]')
    expect(t.body).not.toMatch(/\[[^\]]*time\]/)
  })
  it('no template uses a bare [time], or [date] twice in the body', () => {
    for (const t of NOTICE_TEMPLATES) {
      expect((t.body.match(/\[time\]/g) ?? []).length).toBe(0)
      expect((t.body.match(/\[date\]/g) ?? []).length).toBeLessThanOrEqual(1)
    }
  })
})
