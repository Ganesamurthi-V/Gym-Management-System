/**
 * GymFlow — WhatsApp Message Templates
 *
 * All 7 templates as functions that return a pre-filled wa.me link.
 * Templates use variables interpolated at call time — no hardcoded names.
 *
 * Usage:
 *   import { buildTemplate, WA_TEMPLATES } from '@/lib/whatsapp/templates'
 *   const url = buildTemplate(WA_TEMPLATES.WELCOME, { phone, gymName, memberName, memberId, plan })
 *   window.open(url, '_blank')
 */

import { formatDate, formatCurrency } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

export type TemplateId =
  | 'welcome'
  | 'renewal'
  | 'expiry_reminder'
  | 'expired'
  | 'due_paid'
  | 'birthday'
  | 'custom'

export interface TemplateContext {
  phone: string
  gymName?: string
  memberName: string
  memberId?: string          // e.g. "GF0042"
  plan?: string              // e.g. "Monthly"
  startDate?: string         // ISO date
  endDate?: string           // ISO date
  daysRemaining?: number
  amount?: number            // in rupees
  dueAmount?: number         // pending due amount
  birthday?: string          // ISO date (for birthday wishes)
  customMessage?: string     // for the "custom" template
}

export interface TemplateDefinition {
  id: TemplateId
  label: string
  emoji: string
  description: string
  build: (ctx: TemplateContext) => string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function waLink(phone: string, message: string): string {
  const clean = phone.replace(/\D/g, '')
  // Last 10 digits + country code. startsWith('91') alone dropped the country
  // code for valid 10-digit numbers beginning with "91" (e.g. 9198765432).
  const withCode = clean.length >= 10 ? `91${clean.slice(-10)}` : clean
  return `https://wa.me/${withCode}?text=${encodeURIComponent(message)}`
}

function planLabel(plan?: string): string {
  if (!plan) return 'membership'
  const map: Record<string, string> = {
    monthly: 'Monthly',
    quarterly: 'Quarterly (3 months)',
    annual: 'Annual (12 months)',
  }
  return map[plan.toLowerCase()] ?? plan
}

// ─── Templates ────────────────────────────────────────────────────────────────

export const TEMPLATES: TemplateDefinition[] = [
  // ── 1. Welcome Member ─────────────────────────────────────────────────────
  {
    id: 'welcome',
    label: 'Welcome Member',
    emoji: '🎉',
    description: 'Send when a new member joins',
    build: (ctx) => {
      const lines = [
        `Hi ${ctx.memberName}! 🎉`,
        ``,
        `Welcome to *${ctx.gymName ?? 'our gym'}*! We're excited to have you on board.`,
        ``,
        `Here are your membership details:`,
        `• Member ID: *${ctx.memberId ?? '—'}*`,
        `• Plan: *${planLabel(ctx.plan)}*`,
        ctx.startDate ? `• Start Date: *${formatDate(ctx.startDate)}*` : null,
        ctx.endDate   ? `• Valid Until: *${formatDate(ctx.endDate)}*`   : null,
        ``,
        `💪 Your fitness journey starts now. Let's crush those goals!`,
        ``,
        `See you at the gym! 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 2. Membership Renewed ─────────────────────────────────────────────────
  {
    id: 'renewal',
    label: 'Membership Renewed',
    emoji: '✅',
    description: 'Send after a renewal payment',
    build: (ctx) => {
      const lines = [
        `Hi ${ctx.memberName}! ✅`,
        ``,
        `Your membership at *${ctx.gymName ?? 'our gym'}* has been successfully renewed.`,
        ``,
        `*Renewal Details:*`,
        `• Member ID: *${ctx.memberId ?? '—'}*`,
        `• Plan: *${planLabel(ctx.plan)}*`,
        ctx.startDate ? `• From: *${formatDate(ctx.startDate)}*`     : null,
        ctx.endDate   ? `• Valid Until: *${formatDate(ctx.endDate)}*` : null,
        ctx.amount    ? `• Amount Paid: *${formatCurrency(ctx.amount)}*` : null,
        ``,
        `Thank you for staying with us! 💪`,
        `See you at the gym! 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 3. Expiry Reminder ────────────────────────────────────────────────────
  {
    id: 'expiry_reminder',
    label: 'Expiry Reminder',
    emoji: '⏰',
    description: 'Send when membership is expiring soon',
    build: (ctx) => {
      const days = ctx.daysRemaining ?? 0
      const dayText = days === 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`
      const lines = [
        `Hi ${ctx.memberName}! ⏰`,
        ``,
        `This is a friendly reminder that your membership at *${ctx.gymName ?? 'our gym'}* expires *${dayText}*.`,
        ``,
        ctx.endDate ? `• Expiry Date: *${formatDate(ctx.endDate)}*` : null,
        ``,
        `Renew now to continue your fitness journey without any break! 💪`,
        ``,
        `Contact us to renew your membership. We'd love to keep you going! 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 4. Membership Expired ─────────────────────────────────────────────────
  {
    id: 'expired',
    label: 'Membership Expired',
    emoji: '🔴',
    description: 'Send when membership has expired',
    build: (ctx) => {
      const lines = [
        `Hi ${ctx.memberName}! 🔴`,
        ``,
        `Your membership at *${ctx.gymName ?? 'our gym'}* has expired.`,
        ``,
        ctx.endDate ? `• Expired On: *${formatDate(ctx.endDate)}*` : null,
        ``,
        `We miss you at the gym! Don't let your hard work go to waste. 💪`,
        ``,
        `Renew your membership today and get back on track. Reach out to us — we'll make it easy for you! 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 5. Due Paid ───────────────────────────────────────────────────────────
  {
    id: 'due_paid',
    label: 'Due Paid',
    emoji: '💰',
    description: 'Send after a pending due is collected',
    build: (ctx) => {
      const lines = [
        `Hi ${ctx.memberName}! 💰`,
        ``,
        `We've received your pending payment at *${ctx.gymName ?? 'our gym'}*.`,
        ``,
        ctx.amount ? `• Amount Paid: *${formatCurrency(ctx.amount)}*` : null,
        ctx.dueAmount && ctx.dueAmount > 0
          ? `• Remaining Due: *${formatCurrency(ctx.dueAmount)}*`
          : `• Account Status: *Cleared ✅*`,
        ``,
        `Thank you for clearing your dues! See you at the gym. 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 6. Birthday Wishes ────────────────────────────────────────────────────
  {
    id: 'birthday',
    label: 'Birthday Wishes',
    emoji: '🎂',
    description: 'Send on a member\'s birthday (Marketing)',
    build: (ctx) => {
      const lines = [
        `Happy Birthday, ${ctx.memberName}! 🎂🎉`,
        ``,
        `Wishing you a fantastic birthday from all of us at *${ctx.gymName ?? 'our gym'}*!`,
        ``,
        `May this year bring you great health, strength, and happiness. 💪✨`,
        ``,
        `As a birthday gift, feel free to ask us about any special offers on membership renewals! 🎁`,
        ``,
        `Keep crushing it! 🏋️`,
      ].filter(Boolean).join('\n')
      return waLink(ctx.phone, lines)
    },
  },

  // ── 7. Custom ─────────────────────────────────────────────────────────────
  {
    id: 'custom',
    label: 'Custom Message',
    emoji: '✏️',
    description: 'Write your own message',
    build: (ctx) => {
      return waLink(ctx.phone, ctx.customMessage ?? `Hi ${ctx.memberName}!`)
    },
  },
]

// ─── Public API ───────────────────────────────────────────────────────────────

export function getTemplate(id: TemplateId): TemplateDefinition | undefined {
  return TEMPLATES.find(t => t.id === id)
}

/** Build a wa.me link for the given template and context */
export function buildTemplateLink(id: TemplateId, ctx: TemplateContext): string {
  const template = getTemplate(id)
  if (!template) throw new Error(`Unknown template: ${id}`)
  return template.build(ctx)
}

/** Get the rendered message text (without the wa.me wrapper) */
export function renderTemplate(id: TemplateId, ctx: TemplateContext): string {
  const url = buildTemplateLink(id, ctx)
  return decodeURIComponent(url.split('?text=')[1] ?? '')
}
