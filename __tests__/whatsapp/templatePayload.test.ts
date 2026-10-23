/**
 * Unit tests for the Meta Cloud API template payload builder
 * (services/whatsapp/graph.ts → buildTemplatePayload).
 *
 * These assert the exact structure Meta expects: template name, language,
 * component types, and the positional body/header parameters for each of the
 * six approved templates.
 */

import { describe, it, expect } from 'vitest'
import { buildTemplatePayload } from '@/services/whatsapp/graph'
import type { TemplateContext } from '@/types/whatsapp'

const base: TemplateContext = {
  phone: '9876543210',
  gymName: 'Iron Temple',
  memberName: 'Arjun',
}

/** Pull the flat list of body-parameter text values out of a payload. */
function bodyTexts(payload: any): string[] {
  const body = payload.template.components.find((c: any) => c.type === 'body')
  return (body?.parameters ?? []).map((p: any) => p.text)
}
function headerTexts(payload: any): string[] {
  const header = payload.template.components.find((c: any) => c.type === 'header')
  return (header?.parameters ?? []).map((p: any) => p.text)
}

describe('buildTemplatePayload — common envelope', () => {
  it('normalises Indian phone numbers to include the country code', () => {
    const p = buildTemplatePayload('_gymflow_welcome_member', base) as any
    expect(p.messaging_product).toBe('whatsapp')
    expect(p.type).toBe('template')
    expect(p.to).toBe('919876543210')
  })

  it('does not double-prefix a number that already has 91', () => {
    const p = buildTemplatePayload('_gymflow_welcome_member', { ...base, phone: '919876543210' }) as any
    expect(p.to).toBe('919876543210')
  })

  it('adds the country code to a 10-digit number that itself starts with 91', () => {
    // Regression: 9198765432 is a valid 10-digit mobile. The old
    // startsWith("91") guard left it uncoded → WhatsApp could not route it.
    const p = buildTemplatePayload('_gymflow_welcome_member', { ...base, phone: '9198765432' }) as any
    expect(p.to).toBe('919198765432')
  })

  it('normalises numbers written with +91 and separators', () => {
    const p = buildTemplatePayload('_gymflow_welcome_member', { ...base, phone: '+91 98765 43210' }) as any
    expect(p.to).toBe('919876543210')
  })

  it('throws on an unknown template', () => {
    expect(() => buildTemplatePayload('not_a_template' as any, base)).toThrow()
  })
})

describe('buildTemplatePayload — _gymflow_welcome_member', () => {


  it('maps gym, member, plan, start date, member ID in the body in order and includes an image header', () => {
    const p = buildTemplatePayload('_gymflow_welcome_member', {
      ...base, plan: 'monthly', startDate: '2026-07-06', memberId: 'GF001'
    }) as any
    expect(p.template.name).toBe('_gymflow_welcome_member')
    expect(p.template.language.code).toBe('en')
    expect(bodyTexts(p)).toEqual(['Iron Temple', 'Arjun', 'Monthly', '06 Jul 2026', 'GF001'])

    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })

  it('falls back to a dash when start date and member ID are missing', () => {
    const p = buildTemplatePayload('_gymflow_welcome_member', { ...base, plan: 'annual' }) as any
    expect(bodyTexts(p)).toEqual(['Iron Temple', 'Arjun', 'Annual (12 Months)', '—', '—'])
  })
})

describe('buildTemplatePayload — membership_renewed', () => {
  it('maps member, gym, plan, valid-until in order and includes an image header', () => {
    const p = buildTemplatePayload('membership_renewed', {
      ...base, plan: 'quarterly', validUntil: '2026-10-06',
    }) as any
    expect(p.template.name).toBe('membership_renewed')
    expect(bodyTexts(p)).toEqual(['Arjun', 'Iron Temple', 'Quarterly (3 Months)', '06 Oct 2026'])

    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })
})

describe('buildTemplatePayload — membership_expiry_reminder', () => {
  it('maps member, plan, expiry date, days remaining and includes an image header', () => {
    const p = buildTemplatePayload('membership_expiry_reminder', {
      ...base, plan: 'monthly', expiryDate: '2026-07-20', daysRemaining: 14,
    }) as any
    expect(bodyTexts(p)).toEqual(['Arjun', 'Monthly', '20 Jul 2026', '14'])

    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })

  it('renders 0 days remaining as "0", not blank', () => {
    const p = buildTemplatePayload('membership_expiry_reminder', {
      ...base, plan: 'monthly', expiryDate: '2026-07-06', daysRemaining: 0,
    }) as any
    expect(bodyTexts(p)[3]).toBe('0')
  })
})

describe('buildTemplatePayload — membership_expired', () => {
  it('maps member, gym, expiry date, member ID and includes an image header', () => {
    const p = buildTemplatePayload('membership_expired', {
      ...base, plan: 'monthly', expiryDate: '2026-07-01', memberId: 'GF001'
    }) as any
    expect(bodyTexts(p)).toEqual(['Arjun', 'Iron Temple', '01 Jul 2026', 'GF001'])
    
    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })
})

describe('buildTemplatePayload — payment_due_reminder', () => {
  it('maps member name and a bare grouped amount (template already prints ₹) and includes an image header', () => {
    const p = buildTemplatePayload('payment_due_reminder', { ...base, dueAmount: 1500 }) as any
    const texts = bodyTexts(p)
    expect(texts[0]).toBe('Arjun')
    expect(texts[1]).toBe('1,500')            // NOT "₹1,500" — avoids "₹₹1,500"
    expect(texts[1]).not.toContain('₹')

    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })

  it('defaults a missing amount to zero', () => {
    const p = buildTemplatePayload('payment_due_reminder', base) as any
    expect(bodyTexts(p)[1]).toBe('0')
  })
})

describe('buildTemplatePayload — _birthday_wishes', () => {
  it('maps gym name, member name in order and includes an image header', () => {
    const p = buildTemplatePayload('_birthday_wishes', base) as any
    // Approved body order is [gymName, memberName] → {{1}}, {{2}}.
    expect(bodyTexts(p)).toEqual(['Iron Temple', 'Arjun'])

    const header = p.template.components.find((c: any) => c.type === 'header')
    expect(header.parameters[0].type).toBe('image')
  })
})

// ─── Gamification templates ──────────────────────────────────────────────────
// Body order must equal GAMIFICATION_TEMPLATE_COPY (services/whatsapp/templateSpec.ts)
// and lib/whatsapp/GAMIFICATION_TEMPLATES.md, which is what is typed into Meta.

function expectImageHeader(p: any) {
  const header = p.template.components.find((c: any) => c.type === 'header')
  expect(header.parameters[0].type).toBe('image')
  expect(header.parameters[0].image.link).toMatch(/logo_landspace\.png$/)
}
function componentTypes(p: any): string[] {
  return p.template.components.map((c: any) => c.type)
}

describe('buildTemplatePayload — gym_streak_at_risk', () => {
  it('maps first name, streak days, gym in order with an image header and no button', () => {
    const p = buildTemplatePayload('gym_streak_at_risk', { ...base, memberName: 'Arjun Kumar', streakDays: 5 }) as any
    expect(p.template.name).toBe('gym_streak_at_risk')
    expect(p.template.language.code).toBe('en')
    expect(p.to).toBe('919876543210')
    expect(bodyTexts(p)).toEqual(['Arjun', '5', 'Iron Temple'])
    expect(componentTypes(p)).toEqual(['header', 'body'])
    expectImageHeader(p)
  })

  it('leaves the streak blank when it is missing, so the validator blocks the send', () => {
    const p = buildTemplatePayload('gym_streak_at_risk', base) as any
    expect(bodyTexts(p)[1]).toBe('')
  })
})

describe('buildTemplatePayload — gym_weekly_goal_reached', () => {
  it('maps first name, days attended, gym in order', () => {
    const p = buildTemplatePayload('gym_weekly_goal_reached', { ...base, daysAttended: 4 }) as any
    expect(p.template.name).toBe('gym_weekly_goal_reached')
    expect(bodyTexts(p)).toEqual(['Arjun', '4', 'Iron Temple'])
    expect(componentTypes(p)).toEqual(['header', 'body'])
    expectImageHeader(p)
  })
})

describe('buildTemplatePayload — gym_leaderboard_rank_up', () => {
  it('maps first name, rank, board name, gym in order', () => {
    const p = buildTemplatePayload('gym_leaderboard_rank_up', { ...base, rank: 1, boardName: 'last 7 days' }) as any
    expect(p.template.name).toBe('gym_leaderboard_rank_up')
    expect(bodyTexts(p)).toEqual(['Arjun', '1', 'last 7 days', 'Iron Temple'])
    expect(componentTypes(p)).toEqual(['header', 'body'])
    expectImageHeader(p)
  })
})

describe('buildTemplatePayload — gym_prize_awarded', () => {
  it('maps first name, prize, period, gym in order', () => {
    const p = buildTemplatePayload('gym_prize_awarded', {
      ...base, prize: 'Free protein shaker', periodLabel: 'Last 7 days',
    }) as any
    expect(p.template.name).toBe('gym_prize_awarded')
    expect(bodyTexts(p)).toEqual(['Arjun', 'Free protein shaker', 'Last 7 days', 'Iron Temple'])
    expect(componentTypes(p)).toEqual(['header', 'body'])
    expectImageHeader(p)
  })

  it('flattens line breaks and runs of spaces in owner-written text (Meta rejects them)', () => {
    const p = buildTemplatePayload('gym_prize_awarded', {
      ...base, prize: 'Free shaker\n+  1 month\tfree', periodLabel: '  Last 7 days ',
    }) as any
    expect(bodyTexts(p)[1]).toBe('Free shaker + 1 month free')
    expect(bodyTexts(p)[2]).toBe('Last 7 days')
  })
})

describe('buildTemplatePayload — owner_verification', () => {
  it('has no header and carries the code in body and button', () => {
    const payload = buildTemplatePayload('owner_verification', { ...base, otpCode: '042817' }) as any
    expect(payload.template.name).toBe('owner_verification')
    expect(payload.template.language.code).toBe('en')
    expect(payload.template.components.some((c: any) => c.type === 'header')).toBe(false)
    expect(bodyTexts(payload)).toEqual(['042817'])
    const button = payload.template.components.find((c: any) => c.type === 'button')
    expect(button).toEqual({ type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: '042817' }] })
  })
})
