/**
 * WhatsApp Automation Engine
 *
 * Implements all 6 automated template sending rules:
 *  1. gymflow_welcome_member     — on new member registration (event-driven)
 *  2. membership_renewed         — on renewal payment (event-driven)
 *  3. membership_expiry_reminder — scheduled, every 3 days, up to 7 times
 *  4. membership_expired         — scheduled, every 3 days, up to 7 times
 *  5. payment_due_reminder       — scheduled, every 3 days, up to 7 times
 *  6. birthday_wishes            — scheduled, once per year
 *
 * All scheduled sends go through the cron endpoint: POST /api/cron/whatsapp
 * Event-driven sends are called directly from server actions.
 *
 * Idempotency & cadence are enforced through the whatsapp_automation_logs table:
 *  1. Partial unique index (status='sent') → never send the same template to the
 *     same member twice in one day.
 *  2. Cycle state (send_count / cancelled) → enforce the 3-day gap, the 7-send
 *     cap, and hard-stop a cycle once the member renews or pays.
 *
 * The pure "should we send today?" decision lives in ./scheduling.ts.
 */

import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate } from './sender'
import type { TemplateId, TemplateContext } from './sender'
import {
  MAX_REMINDER_SENDS,
  daysUntil,
  isExpiringInWindow,
  isExpiredInWindow,
  isBirthdayToday,
  decideScheduledSend,
  type CycleState,
} from './scheduling'
import { format } from 'date-fns'

// ─── DB Client ────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

type AdminClient = ReturnType<typeof getAdminClient>

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutomationMember {
  id: string
  gym_id: string
  name: string
  phone: string
  date_of_birth: string | null
  pending_amount: number
  latest_membership: {
    plan: string
    end_date: string
    category?: string
  } | null
}

interface GymRow {
  id: string
  name: string
}

interface Stats {
  processed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}

/** The three cyclic reminder templates managed by the scheduler. */
const CYCLIC_TEMPLATES = [
  'membership_expiry_reminder',
  'membership_expired',
  'payment_due_reminder',
] as const

// ─── Cycle state helpers ───────────────────────────────────────────────────────

/**
 * Read the current state of a specific reminder cycle (identified by cycleKey).
 * The most recent row wins: a 'cancelled' row closes the cycle; otherwise its
 * send_count is the number of sends so far.
 */
async function getCycleState(
  supabase: AdminClient,
  memberId: string,
  templateName: string,
  cycleKey: string,
): Promise<CycleState> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('send_count, status, sent_at')
    .eq('member_id', memberId)
    .eq('template_name', templateName)
    .eq('cycle_key', cycleKey)
    .order('sent_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) {
    return { sendCount: 0, lastSentAt: null, cancelled: false }
  }

  const row = data[0] as { send_count: number; status: string; sent_at: string }
  const cancelled = row.status === 'cancelled'
  return {
    sendCount: cancelled ? MAX_REMINDER_SENDS : row.send_count,
    lastSentAt: row.sent_at,
    cancelled,
  }
}

/**
 * Was any send for this member + template recorded today?
 * Used as the hard same-day dedup gate (mirrors the partial unique index).
 */
async function alreadySentToday(
  supabase: AdminClient,
  memberId: string,
  templateName: string,
  today: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', templateName)
    .eq('status', 'sent')
    .gte('sent_at', `${today}T00:00:00.000Z`)
    .lt('sent_at', `${today}T23:59:59.999Z`)
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Resolve the cycle key for the payment_due_reminder cycle.
 *
 * Unlike expiry/expired (which have a stable trigger date = membership end date),
 * a payment due has no natural anchor, so we must NOT key the cycle by "today"
 * (that would restart the cycle every day and send a reminder daily).
 *
 * Instead we continue the member's active due cycle:
 *   - no prior cycle            → start a new one anchored to today
 *   - latest cycle cancelled    → previous due was paid; start a fresh one today
 *   - latest cycle complete     → 7 reminders already sent; stop (return null)
 *   - otherwise                 → continue the existing cycle
 */
async function resolveDueCycleKey(
  supabase: AdminClient,
  memberId: string,
  today: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('whatsapp_automation_logs')
    .select('cycle_key, send_count, status')
    .eq('member_id', memberId)
    .eq('template_name', 'payment_due_reminder')
    .order('sent_at', { ascending: false })
    .limit(1)

  const newKey = `payment_due_reminder:${memberId}:${today}`

  if (!data || data.length === 0) return newKey

  const latest = data[0] as { cycle_key: string; send_count: number; status: string }

  if (latest.status === 'cancelled') return newKey            // previous due paid → new cycle
  if (latest.send_count >= MAX_REMINDER_SENDS) return null    // cycle exhausted → stop
  return latest.cycle_key                                      // continue active cycle
}

/**
 * Was the welcome message already sent for this member (ever)?
 */
async function welcomeAlreadySent(
  supabase: AdminClient,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', 'gymflow_welcome_member')
    .eq('status', 'sent')
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Was a birthday wish already sent this calendar year?
 */
async function birthdayAlreadySentThisYear(
  supabase: AdminClient,
  memberId: string,
  year: number,
): Promise<boolean> {
  const yearStart = `${year}-01-01T00:00:00.000Z`
  const yearEnd   = `${year}-12-31T23:59:59.999Z`

  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', 'birthday_wishes')
    .eq('status', 'sent')
    .gte('sent_at', yearStart)
    .lte('sent_at', yearEnd)
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Record a send / failure / cancellation in the log.
 */
async function recordSend(
  supabase: AdminClient,
  {
    gymId,
    memberId,
    phone,
    templateName,
    cycleKey,
    sendCount,
    messageId,
    status,
    errorMessage,
    triggerDate,
    metadata,
  }: {
    gymId: string
    memberId: string
    phone: string
    templateName: string
    cycleKey: string
    sendCount: number
    messageId?: string
    status: 'sent' | 'failed' | 'skipped' | 'cancelled'
    errorMessage?: string
    triggerDate?: string
    metadata?: Record<string, unknown>
  },
): Promise<void> {
  const { error } = await supabase.from('whatsapp_automation_logs').insert({
    gym_id: gymId,
    member_id: memberId,
    phone_number: phone,
    template_name: templateName,
    cycle_key: cycleKey,
    send_count: sendCount,
    message_id: messageId ?? null,
    status,
    error_message: errorMessage ?? null,
    trigger_date: triggerDate ?? null,
    metadata: metadata ?? {},
  })

  if (error) {
    // Unique index violation = already sent today, safe to ignore
    if (!error.message?.includes('unique') && !error.message?.includes('duplicate')) {
      console.error('[WA Automation] Failed to record send:', error.message)
    }
  }
}

// ─── Event-driven sends ───────────────────────────────────────────────────────

/**
 * Send welcome message immediately after new member is created.
 * Called from the new member server action.
 * Idempotent — skips if already sent.
 */
export async function sendWelcomeMessage({
  gymId,
  gymName,
  memberId,
  memberName,
  phone,
  plan,
  startDate,
}: {
  gymId: string
  gymName: string
  memberId: string
  memberName: string
  phone: string
  plan: string
  startDate: string
}): Promise<void> {
  if (!phone || phone.replace(/\D/g, '').length < 10) return

  const supabase = getAdminClient()

  // Skip if already sent
  if (await welcomeAlreadySent(supabase, memberId)) return

  const ctx: TemplateContext = {
    phone,
    gymName,
    memberName,
    plan,
    startDate,
  }

  const result = await sendWhatsAppTemplate('gymflow_welcome_member', ctx)
  const cycleKey = `gymflow_welcome_member:${memberId}:${startDate}`

  await recordSend(supabase, {
    gymId,
    memberId,
    phone,
    templateName: 'gymflow_welcome_member',
    cycleKey,
    sendCount: 1,
    messageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    triggerDate: startDate,
  })
}

/**
 * Send renewal confirmation immediately after a membership is renewed.
 * Called from the renewal server action / MemberDetailClient.
 * Fire-and-forget — does not block the UI.
 */
export async function sendRenewalMessage({
  gymId,
  gymName,
  memberId,
  memberName,
  phone,
  plan,
  validUntil,
}: {
  gymId: string
  gymName: string
  memberId: string
  memberName: string
  phone: string
  plan: string
  validUntil: string
}): Promise<void> {
  if (!phone || phone.replace(/\D/g, '').length < 10) return

  const supabase = getAdminClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const cycleKey = `membership_renewed:${memberId}:${today}`

  // Skip if already sent today (e.g. double-click)
  if (await alreadySentToday(supabase, memberId, 'membership_renewed', today)) return

  const ctx: TemplateContext = {
    phone,
    gymName,
    memberName,
    plan,
    validUntil,
  }

  const result = await sendWhatsAppTemplate('membership_renewed', ctx)

  await recordSend(supabase, {
    gymId,
    memberId,
    phone,
    templateName: 'membership_renewed',
    cycleKey,
    sendCount: 1,
    messageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    triggerDate: today,
  })
}

// ─── Scheduled sends (called by cron) ────────────────────────────────────────

/**
 * Process all scheduled WhatsApp reminders for every active gym.
 *
 * This is the main cron job function — runs once per day.
 * It processes:
 *  - membership_expiry_reminder (members expiring within the window)
 *  - membership_expired         (members expired within the window)
 *  - payment_due_reminder       (members with pending_amount > 0)
 *  - birthday_wishes            (members whose birthday is today)
 */
export async function runDailyWhatsAppAutomation(): Promise<Stats> {
  const supabase = getAdminClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  const stats: Stats = { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] }

  try {
    // ── Fetch all active gyms ──────────────────────────────────────────────
    const { data: gyms, error: gymErr } = await supabase
      .from('gyms')
      .select('id, name')
      .eq('onboarding_completed', true)

    if (gymErr || !gyms) {
      stats.errors.push(`Failed to fetch gyms: ${gymErr?.message}`)
      return stats
    }

    for (const gym of gyms as GymRow[]) {
      try {
        await processGym(supabase, gym, today, stats)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.errors.push(`Gym ${gym.id}: ${msg}`)
        console.error(`[WA Automation] Error processing gym ${gym.id}:`, msg)
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    stats.errors.push(`Fatal: ${msg}`)
  }

  return stats
}

async function processGym(
  supabase: AdminClient,
  gym: GymRow,
  today: string,
  stats: Stats,
): Promise<void> {
  const { data: members, error } = await supabase
    .from('members')
    .select(`
      id, gym_id, name, phone, date_of_birth, pending_amount,
      memberships(plan, end_date, category, created_at)
    `)
    .eq('gym_id', gym.id)
    .not('phone', 'is', null)

  if (error || !members) {
    stats.errors.push(`Gym ${gym.id} member fetch: ${error?.message}`)
    return
  }

  for (const rawMember of members as any[]) {
    const phone: string = rawMember.phone ?? ''
    // Skip invalid phones
    if (!phone || phone.replace(/\D/g, '').length < 10) continue

    // Resolve latest membership
    const memberships = (rawMember.memberships ?? []) as { plan: string; end_date: string; created_at: string }[]
    const latestMs = memberships
      .slice()
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null

    const member: AutomationMember = {
      id: rawMember.id,
      gym_id: rawMember.gym_id,
      name: rawMember.name,
      phone,
      date_of_birth: rawMember.date_of_birth ?? null,
      pending_amount: rawMember.pending_amount ?? 0,
      latest_membership: latestMs
        ? { plan: latestMs.plan, end_date: latestMs.end_date }
        : null,
    }

    stats.processed++

    // ── 1. Expiry / expired reminders ─────────────────────────────────────
    if (member.latest_membership) {
      const endDate = member.latest_membership.end_date

      if (isExpiringInWindow(endDate, today)) {
        await tryScheduledSend({
          supabase, gym, member, today,
          templateName: 'membership_expiry_reminder',
          cycleKey: `membership_expiry_reminder:${member.id}:${endDate}`,
          triggerDate: endDate,
          ctx: {
            phone,
            gymName: gym.name,
            memberName: member.name,
            plan: member.latest_membership.plan,
            expiryDate: endDate,
            daysRemaining: daysUntil(endDate, today),
          },
          stats,
        })
      } else if (isExpiredInWindow(endDate, today)) {
        await tryScheduledSend({
          supabase, gym, member, today,
          templateName: 'membership_expired',
          cycleKey: `membership_expired:${member.id}:${endDate}`,
          triggerDate: endDate,
          ctx: {
            phone,
            gymName: gym.name,
            memberName: member.name,
            plan: member.latest_membership.plan,
            expiryDate: endDate,
          },
          stats,
        })
      }
    }

    // ── 2. Payment due reminder ───────────────────────────────────────────
    if (member.pending_amount > 0) {
      const dueCycleKey = await resolveDueCycleKey(supabase, member.id, today)
      if (dueCycleKey) {
        await tryScheduledSend({
          supabase, gym, member, today,
          templateName: 'payment_due_reminder',
          cycleKey: dueCycleKey,
          triggerDate: dueCycleKey.split(':').pop() ?? today,
          ctx: {
            phone,
            gymName: gym.name,
            memberName: member.name,
            dueAmount: member.pending_amount,
          },
          stats,
        })
      } else {
        stats.skipped++
      }
    }

    // ── 3. Birthday wishes ────────────────────────────────────────────────
    if (member.date_of_birth && isBirthdayToday(member.date_of_birth, today)) {
      const year = parseInt(today.slice(0, 4), 10)
      if (await birthdayAlreadySentThisYear(supabase, member.id, year)) {
        stats.skipped++
      } else {
        const result = await sendWhatsAppTemplate('birthday_wishes', {
          phone,
          gymName: gym.name,
          memberName: member.name,
        })
        await recordSend(supabase, {
          gymId: gym.id,
          memberId: member.id,
          phone,
          templateName: 'birthday_wishes',
          cycleKey: `birthday_wishes:${member.id}:${year}`,
          sendCount: 1,
          messageId: result.messageId,
          status: result.success ? 'sent' : 'failed',
          errorMessage: result.error,
          triggerDate: today,
        })
        result.success ? stats.sent++ : stats.failed++
      }
    }
  }
}

/**
 * Attempt a scheduled cyclic send (expiry / expired / due reminders).
 * Cadence & cancellation are enforced by decideScheduledSend().
 */
async function tryScheduledSend({
  supabase,
  gym,
  member,
  today,
  templateName,
  cycleKey,
  triggerDate,
  ctx,
  stats,
}: {
  supabase: AdminClient
  gym: GymRow
  member: AutomationMember
  today: string
  templateName: TemplateId
  cycleKey: string
  triggerDate: string
  ctx: TemplateContext
  stats: Stats
}): Promise<void> {
  const state = await getCycleState(supabase, member.id, templateName, cycleKey)
  const alreadyToday = await alreadySentToday(supabase, member.id, templateName, today)

  const decision = decideScheduledSend(state, { alreadySentToday: alreadyToday, today })
  if (!decision.send) {
    stats.skipped++
    return
  }

  const result = await sendWhatsAppTemplate(templateName, ctx)

  await recordSend(supabase, {
    gymId: gym.id,
    memberId: member.id,
    phone: member.phone,
    templateName,
    cycleKey,
    sendCount: state.sendCount + 1,
    messageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    triggerDate,
    metadata: { daysRemaining: ctx.daysRemaining, dueAmount: ctx.dueAmount },
  })

  result.success ? stats.sent++ : stats.failed++
}

/**
 * Cancel active reminder cycles for a member.
 * Call this when a member renews their membership or clears their dues.
 *
 * For each template we find the member's most recent cycle and, if it's still
 * active (not already cancelled or complete), record a single 'cancelled'
 * sentinel row. getCycleState() then treats that cycle as closed, so the
 * scheduler will never send another reminder for it.
 *
 * The cycle is resolved from the logs, so callers don't need to know the exact
 * trigger date — the `triggerDate` argument is retained only for the audit row.
 */
export async function cancelReminderCycles({
  gymId,
  memberId,
  phone,
  templates,
  triggerDate,
}: {
  gymId: string
  memberId: string
  phone: string
  templates: TemplateId[]
  triggerDate?: string
}): Promise<void> {
  const supabase = getAdminClient()

  for (const template of templates) {
    const { data } = await supabase
      .from('whatsapp_automation_logs')
      .select('cycle_key, send_count, status')
      .eq('member_id', memberId)
      .eq('template_name', template)
      .order('sent_at', { ascending: false })
      .limit(1)

    if (!data || data.length === 0) continue

    const latest = data[0] as { cycle_key: string; send_count: number; status: string }

    // Already cancelled or fully sent — nothing to do.
    if (latest.status === 'cancelled' || latest.send_count >= MAX_REMINDER_SENDS) continue

    await recordSend(supabase, {
      gymId,
      memberId,
      phone,
      templateName: template,
      cycleKey: latest.cycle_key,
      sendCount: MAX_REMINDER_SENDS,
      status: 'cancelled',
      errorMessage: 'Cancelled — member renewed or paid',
      triggerDate: triggerDate ?? latest.cycle_key.split(':').pop(),
    })
  }
}
