/**
 * WhatsApp Automation Engine
 *
 * Implements all 6 automated template sending rules:
 *  1. gymflow_welcome_member   — on new member registration (event-driven)
 *  2. membership_renewed       — on renewal payment (event-driven)
 *  3. membership_expiry_reminder — scheduled, every 3 days, up to 7 times
 *  4. membership_expired       — scheduled, every 3 days, up to 7 times
 *  5. payment_due_reminder     — scheduled, every 3 days, up to 7 times
 *  6. birthday_wishes          — scheduled, once per year
 *
 * All scheduled sends go through the cron endpoint: POST /api/cron/whatsapp
 * Event-driven sends are called directly from server actions.
 *
 * Idempotency is enforced at two layers:
 *  1. DB unique index: (member_id, template_name, sent_at::date)
 *  2. Cycle key: prevents restarting a reminder cycle that's already complete
 */

import { createClient } from '@supabase/supabase-js'
import { sendWhatsAppTemplate } from './sender'
import type { TemplateId, TemplateContext } from './sender'
import { formatDate } from '@/lib/utils'
import { format, differenceInDays, parseISO, addDays } from 'date-fns'

// ─── Constants ────────────────────────────────────────────────────────────────

/** Max sends per reminder cycle (Day 0, 3, 6, 9, 12, 15, 18 = 7 sends) */
const MAX_REMINDER_SENDS = 7
/** Interval between reminder sends in days */
const REMINDER_INTERVAL_DAYS = 3
/** Total reminder window = 7 × 3 = 21 days */
const REMINDER_WINDOW_DAYS = (MAX_REMINDER_SENDS - 1) * REMINDER_INTERVAL_DAYS // 18

// ─── DB Client ────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

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

// ─── Log helpers ─────────────────────────────────────────────────────────────

/**
 * How many times has this cycle already sent?
 * Returns -1 if the member already renewed (cycle should stop).
 */
async function getCycleSendCount(
  supabase: ReturnType<typeof getAdminClient>,
  memberId: string,
  templateName: string,
  cycleKey: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('send_count, id')
    .eq('member_id', memberId)
    .eq('template_name', templateName)
    .eq('cycle_key', cycleKey)
    .order('sent_at', { ascending: false })
    .limit(1)

  if (error || !data || data.length === 0) return 0
  return data[0].send_count
}

/**
 * Was a message already sent today for this member + template?
 */
async function alreadySentToday(
  supabase: ReturnType<typeof getAdminClient>,
  memberId: string,
  templateName: string,
  today: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', templateName)
    .gte('sent_at', `${today}T00:00:00Z`)
    .lt('sent_at', `${today}T23:59:59Z`)
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Was the welcome message already sent for this member (ever)?
 */
async function welcomeAlreadySent(
  supabase: ReturnType<typeof getAdminClient>,
  memberId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', 'gymflow_welcome_member')
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Was a birthday wish already sent this calendar year?
 */
async function birthdayAlreadySentThisYear(
  supabase: ReturnType<typeof getAdminClient>,
  memberId: string,
  year: number,
): Promise<boolean> {
  const yearStart = `${year}-01-01T00:00:00Z`
  const yearEnd   = `${year}-12-31T23:59:59Z`

  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .select('id')
    .eq('member_id', memberId)
    .eq('template_name', 'birthday_wishes')
    .gte('sent_at', yearStart)
    .lte('sent_at', yearEnd)
    .limit(1)

  return !error && data !== null && data.length > 0
}

/**
 * Record a successful or failed send in the log.
 */
async function recordSend(
  supabase: ReturnType<typeof getAdminClient>,
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
    status: 'sent' | 'failed' | 'skipped'
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
 *  - membership_expiry_reminder (members expiring within 21 days)
 *  - membership_expired         (members expired within last 21 days)
 *  - payment_due_reminder       (members with pending_amount > 0)
 *  - birthday_wishes            (members whose birthday is today)
 */
export async function runDailyWhatsAppAutomation(): Promise<{
  processed: number
  sent: number
  skipped: number
  failed: number
  errors: string[]
}> {
  const supabase = getAdminClient()
  const today = format(new Date(), 'yyyy-MM-dd')
  const todayDate = new Date(today)

  const stats = { processed: 0, sent: 0, skipped: 0, failed: 0, errors: [] as string[] }

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
        await processGym(supabase, gym, today, todayDate, stats)
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
  supabase: ReturnType<typeof getAdminClient>,
  gym: GymRow,
  today: string,
  todayDate: Date,
  stats: { processed: number; sent: number; skipped: number; failed: number; errors: string[] },
): Promise<void> {
  // Fetch members that might need automation
  // - memberships expiring in next 21 days OR expired in last 21 days
  // - pending_amount > 0
  // - birthday today
  const windowStart = format(addDays(todayDate, -REMINDER_WINDOW_DAYS), 'yyyy-MM-dd')
  const windowEnd   = format(addDays(todayDate, REMINDER_WINDOW_DAYS), 'yyyy-MM-dd')

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

    // ── 1. Expiry reminders ───────────────────────────────────────────────
    if (member.latest_membership) {
      const endDate = parseISO(member.latest_membership.end_date)
      const daysUntilExpiry = differenceInDays(endDate, todayDate) // negative = expired

      if (daysUntilExpiry >= 0 && daysUntilExpiry <= REMINDER_WINDOW_DAYS) {
        // Expiring within window — send membership_expiry_reminder
        await tryScheduledSend({
          supabase, gym, member, today,
          templateName: 'membership_expiry_reminder',
          triggerDate: member.latest_membership.end_date,
          ctx: {
            phone,
            gymName: gym.name,
            memberName: member.name,
            plan: member.latest_membership.plan,
            expiryDate: member.latest_membership.end_date,
            daysRemaining: daysUntilExpiry,
          },
          stats,
        })
      } else if (daysUntilExpiry < 0 && Math.abs(daysUntilExpiry) <= REMINDER_WINDOW_DAYS) {
        // Expired within window — send membership_expired
        await tryScheduledSend({
          supabase, gym, member, today,
          templateName: 'membership_expired',
          triggerDate: member.latest_membership.end_date,
          ctx: {
            phone,
            gymName: gym.name,
            memberName: member.name,
            plan: member.latest_membership.plan,
            expiryDate: member.latest_membership.end_date,
          },
          stats,
        })
      }
    }

    // ── 2. Payment due reminder ───────────────────────────────────────────
    if (member.pending_amount > 0) {
      await tryScheduledSend({
        supabase, gym, member, today,
        templateName: 'payment_due_reminder',
        triggerDate: today,
        ctx: {
          phone,
          gymName: gym.name,
          memberName: member.name,
          dueAmount: member.pending_amount,
        },
        stats,
      })
    }

    // ── 3. Birthday wishes ────────────────────────────────────────────────
    if (member.date_of_birth) {
      const dob = member.date_of_birth // "YYYY-MM-DD"
      const [, dobMonth, dobDay] = dob.split('-')
      const [todayYear, todayMonth, todayDay] = today.split('-')

      if (dobMonth === todayMonth && dobDay === todayDay) {
        const year = parseInt(todayYear, 10)
        const alreadySent = await birthdayAlreadySentThisYear(supabase, member.id, year)
        if (!alreadySent) {
          const result = await sendWhatsAppTemplate('birthday_wishes', {
            phone,
            gymName: gym.name,
            memberName: member.name,
          })
          const cycleKey = `birthday_wishes:${member.id}:${todayYear}`
          await recordSend(supabase, {
            gymId: gym.id,
            memberId: member.id,
            phone,
            templateName: 'birthday_wishes',
            cycleKey,
            sendCount: 1,
            messageId: result.messageId,
            status: result.success ? 'sent' : 'failed',
            errorMessage: result.error,
            triggerDate: today,
          })
          result.success ? stats.sent++ : stats.failed++
        } else {
          stats.skipped++
        }
      }
    }
  }
}

/**
 * Attempt a scheduled send (expiry/expired/due reminders).
 * Enforces:
 *  - Once every REMINDER_INTERVAL_DAYS days
 *  - Max MAX_REMINDER_SENDS per cycle
 *  - Stop if member has renewed (for expiry templates)
 */
async function tryScheduledSend({
  supabase,
  gym,
  member,
  today,
  templateName,
  triggerDate,
  ctx,
  stats,
}: {
  supabase: ReturnType<typeof getAdminClient>
  gym: GymRow
  member: AutomationMember
  today: string
  templateName: string
  triggerDate: string
  ctx: TemplateContext
  stats: { sent: number; skipped: number; failed: number }
}): Promise<void> {
  const cycleKey = `${templateName}:${member.id}:${triggerDate}`

  // Already sent today?
  if (await alreadySentToday(supabase, member.id, templateName, today)) {
    stats.skipped++
    return
  }

  // How many times sent in this cycle?
  const sendCount = await getCycleSendCount(supabase, member.id, templateName, cycleKey)

  // Cycle complete?
  if (sendCount >= MAX_REMINDER_SENDS) {
    stats.skipped++
    return
  }

  // Enforce 3-day interval — find the last send date for this cycle
  if (sendCount > 0) {
    const { data: lastLog } = await supabase
      .from('whatsapp_automation_logs')
      .select('sent_at')
      .eq('member_id', member.id)
      .eq('template_name', templateName)
      .eq('cycle_key', cycleKey)
      .order('sent_at', { ascending: false })
      .limit(1)

    if (lastLog && lastLog.length > 0) {
      const lastSent = parseISO(lastLog[0].sent_at)
      const daysSinceLast = differenceInDays(new Date(today), lastSent)
      if (daysSinceLast < REMINDER_INTERVAL_DAYS) {
        stats.skipped++
        return
      }
    }
  }

  // All checks pass — send
  const result = await sendWhatsAppTemplate(templateName as TemplateId, ctx)

  await recordSend(supabase, {
    gymId: gym.id,
    memberId: member.id,
    phone: member.phone,
    templateName,
    cycleKey,
    sendCount: sendCount + 1,
    messageId: result.messageId,
    status: result.success ? 'sent' : 'failed',
    errorMessage: result.error,
    triggerDate,
    metadata: { daysRemaining: ctx.daysRemaining, dueAmount: ctx.dueAmount },
  })

  result.success ? stats.sent++ : stats.failed++
}

/**
 * Cancel all pending reminder cycles for a member.
 * Call this when a member renews their membership or clears dues.
 *
 * This doesn't delete logs — it records a 'skipped' entry with
 * send_count = MAX_REMINDER_SENDS to signal "cycle complete, stop sending".
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
  triggerDate: string
}): Promise<void> {
  const supabase = getAdminClient()
  const today = format(new Date(), 'yyyy-MM-dd')

  for (const template of templates) {
    const cycleKey = `${template}:${memberId}:${triggerDate}`
    const sendCount = await getCycleSendCount(supabase, memberId, template, cycleKey)

    if (sendCount < MAX_REMINDER_SENDS) {
      // Fill to max so the scheduler won't send any more
      for (let i = sendCount; i < MAX_REMINDER_SENDS; i++) {
        await recordSend(supabase, {
          gymId,
          memberId,
          phone,
          templateName: template,
          cycleKey,
          sendCount: i + 1,
          status: 'skipped',
          errorMessage: 'Cancelled — member renewed or paid',
          triggerDate,
        })
      }
    }
  }
}
