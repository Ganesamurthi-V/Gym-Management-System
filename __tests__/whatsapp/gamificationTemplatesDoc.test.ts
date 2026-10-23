/**
 * The gamification templates are typed into WhatsApp Manager by hand from
 * lib/whatsapp/GAMIFICATION_TEMPLATES.md, while the code sends what
 * services/whatsapp/templateSpec.ts says. These tests keep the two identical, so the sheet
 * can never describe a template the code does not send (wrong name, a different sentence,
 * one variable more or less).
 *
 * They also pin the shipping default: the enable-list is empty and sendTemplate refuses a
 * gamification template that is not on it, without calling Meta.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
// The recipient-window RPC needs a database; these tests are about the send path, so slots are always granted.
vi.mock('@/lib/whatsapp/recipientLimit', async (orig) => ({
  ...(await orig<typeof import('@/lib/whatsapp/recipientLimit')>()),
  reserveRecipient: async () => ({ allowed: true, isNew: true }),
  releaseRecipient: async () => {},
}))
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const h = vi.hoisted(() => ({ fetchJson: vi.fn() }))
vi.mock('@/lib/fetch', () => ({ fetchJson: (...a: unknown[]) => h.fetchJson(...a) }))

import {
  GAMIFICATION_TEMPLATE_COPY,
  GAMIFICATION_TEMPLATE_IDS,
  TEMPLATE_SPECS,
  isGamificationTemplate,
} from '@/services/whatsapp/templateSpec'
import { ENABLED_GAMIFICATION_TEMPLATES, isGamificationTemplateEnabled } from '@/config/whatsapp'
import { sendTemplate, buildTemplatePayload, GAMIFICATION_TEMPLATE_DISABLED_MESSAGE } from '@/services/whatsapp/graph'
import { validateTemplatePayload } from '@/services/whatsapp/validateTemplate'
import type { TemplateContext } from '@/types/whatsapp'

const DOC_PATH = fileURLToPath(new URL('../../lib/whatsapp/GAMIFICATION_TEMPLATES.md', import.meta.url))
const doc = readFileSync(DOC_PATH, 'utf8').replace(/\r\n/g, '\n')

interface DocTemplate {
  name: string
  category: string
  language: string
  header: string
  footer: string
  buttons: string
  body: string
  variables: Array<{ position: number; meaning: string; example: string }>
}

/** Parse every "## gym_*" section of the sheet. */
function parseDoc(markdown: string): Map<string, DocTemplate> {
  const out = new Map<string, DocTemplate>()
  const sections = markdown.split(/^## /m).slice(1)
  for (const section of sections) {
    const heading = section.slice(0, section.indexOf('\n')).trim()
    if (!/^gym_[a-z_]+$/.test(heading)) continue

    const field = (label: string) => {
      const m = new RegExp(`^- \\*\\*${label}:\\*\\* (.+)$`, 'm').exec(section)
      return m ? m[1].trim() : ''
    }
    const unquote = (s: string) => s.replace(/`/g, '')
    const bodyMatch = /```text\n([\s\S]*?)\n```/.exec(section)
    const variables = [...section.matchAll(/^\| \{\{(\d+)\}\} \| (.+?) \| (.+?) \|$/gm)].map(m => ({
      position: Number(m[1]),
      meaning: m[2].trim(),
      example: m[3].trim(),
    }))

    out.set(heading, {
      name: unquote(field('Template name')),
      category: field('Category'),
      language: unquote(field('Language')),
      header: field('Header'),
      footer: field('Footer'),
      buttons: field('Buttons'),
      body: bodyMatch ? bodyMatch[1] : '',
      variables,
    })
  }
  return out
}

/** The placeholder numbers in a body, in order of appearance. */
function placeholders(body: string): number[] {
  return [...body.matchAll(/\{\{(\d+)\}\}/g)].map(m => Number(m[1]))
}

const parsed = parseDoc(doc)

describe('GAMIFICATION_TEMPLATES.md matches templateSpec.ts', () => {
  it('documents exactly the gamification templates, no more and no fewer', () => {
    expect([...parsed.keys()].sort()).toEqual([...GAMIFICATION_TEMPLATE_IDS].sort())
  })

  for (const id of GAMIFICATION_TEMPLATE_IDS) {
    describe(id, () => {
      const spec = TEMPLATE_SPECS[id]
      const copy = GAMIFICATION_TEMPLATE_COPY[id]
      const section = () => parsed.get(id)!

      it('has the exact template name', () => {
        expect(section().name).toBe(spec.name)
        expect(spec.name).toBe(id)
      })

      it('has the same category and language', () => {
        expect(section().category).toBe(copy.category)
        expect(section().language).toBe(spec.language)
      })

      it('has the same body text, character for character', () => {
        expect(section().body).toBe(copy.bodyText)
      })

      it('has one variable row per body parameter, numbered {{1}}..{{n}}', () => {
        const n = spec.body.length
        expect(section().variables.map(v => v.position)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
        // every placeholder is used in the body exactly once, in order
        expect(placeholders(copy.bodyText)).toEqual(Array.from({ length: n }, (_, i) => i + 1))
      })

      it('lists the same example values', () => {
        expect(section().variables.map(v => v.example)).toEqual(copy.examples)
        expect(copy.examples).toHaveLength(spec.body.length)
      })

      it('states the header, footer and buttons the payload is built with', () => {
        expect(spec.header).toBe('image')
        expect(section().header).toMatch(/^Image/)
        expect(section().footer).toBe('none')
        expect(spec.button).toBeUndefined()
        expect(section().buttons).toBe('none')
      })

      it('follows the Meta body rules', () => {
        const body = copy.bodyText
        expect(body).not.toMatch(/^\{\{/)          // must not start with a placeholder
        expect(body).not.toMatch(/\}\}$/)          // must not end with one
        expect(body).not.toMatch(/\}\}\s*\{\{/)    // two placeholders must not touch
        // Paragraph breaks are allowed in a body; tabs and long space runs are not.
        expect(body).not.toMatch(/\t| {5,}/)
        expect(body.length).toBeLessThanOrEqual(1024)
      })

      it('builds a payload from the example values that passes the validator', () => {
        const [, second, third] = copy.examples
        const ctx: TemplateContext = {
          phone: '9876543210',
          gymName: 'Iron Temple',
          memberName: 'Arjun Kumar',
          streakDays: Number(second),
          daysAttended: Number(second),
          rank: Number(second),
          boardName: third,
          prize: second,
          periodLabel: third,
        }
        const payload = buildTemplatePayload(id, ctx) as any
        expect(validateTemplatePayload(id, payload).errors).toEqual([])
        const texts = payload.template.components.find((c: any) => c.type === 'body').parameters.map((p: any) => p.text)
        expect(texts).toEqual(copy.examples)
      })
    })
  }

  it('points at the enable-list', () => {
    expect(doc).toContain('ENABLED_GAMIFICATION_TEMPLATES')
    expect(doc).toContain('config/whatsapp.ts')
  })

  it('never describes how long a missed day is tolerated', () => {
    const texts = [doc, ...GAMIFICATION_TEMPLATE_IDS.map(id => GAMIFICATION_TEMPLATE_COPY[id].bodyText)]
    for (const text of texts) {
      expect(text).not.toMatch(/grace|cut-?off|roll-?over|midnight|5 ?(am|a\.m\.|hours|hrs)|05:00/i)
    }
  })
})

describe('gamification templates are off until enabled', () => {
  beforeEach(() => {
    h.fetchJson.mockReset()
    h.fetchJson.mockResolvedValue({ status: 200, data: { messages: [{ id: 'wamid.1' }] } })
    process.env.WHATSAPP_BASE_URL = 'https://graph.example.test'
    process.env.WHATSAPP_PHONE_NUMBER_ID = '123'
    process.env.WHATSAPP_ACCESS_TOKEN = 'token'
  })

  it('ships with an empty enable-list', () => {
    // If you are enabling a template on purpose after Meta approved it, update this
    // expectation in the same change.
    expect(ENABLED_GAMIFICATION_TEMPLATES).toEqual([])
    for (const id of GAMIFICATION_TEMPLATE_IDS) expect(isGamificationTemplateEnabled(id)).toBe(false)
  })

  it('only gym_* templates are governed by the enable-list', () => {
    expect(isGamificationTemplate('gym_streak_at_risk')).toBe(true)
    expect(isGamificationTemplate('payment_due_reminder')).toBe(false)
  })

  it('sendTemplate does not call Meta for a gamification template that is not enabled', async () => {
    for (const id of GAMIFICATION_TEMPLATE_IDS) {
      const r = await sendTemplate(id, {
        phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun',
        streakDays: 5, daysAttended: 4, rank: 1, boardName: 'last 7 days', prize: 'Shaker', periodLabel: 'Last 7 days',
      })
      expect(r).toEqual({ success: false, skipped: true, error: GAMIFICATION_TEMPLATE_DISABLED_MESSAGE })
    }
    expect(h.fetchJson).not.toHaveBeenCalled()
  })

  it('still sends the existing templates', async () => {
    const r = await sendTemplate('_birthday_wishes', { phone: '9876543210', gymName: 'Iron Temple', memberName: 'Arjun' })
    expect(r.success).toBe(true)
    expect(h.fetchJson).toHaveBeenCalledTimes(1)
  })
})
