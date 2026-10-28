/**
 * WhatsApp Automation Engine
 *
 * Implements the automated template sending rules:
 *  1. _gymflow_welcome_member     — on new member registration (event-driven)
 *  2. membership_renewed         — on renewal payment (event-driven)
 *  3. membership_expiry_reminder — scheduled, every 3 days, up to 7 times
 *  4. membership_expired         — scheduled, every 3 days, up to 7 times
 *  5. payment_due_reminder       — scheduled, every 3 days, up to 7 times
 *  6. _birthday_wishes            — scheduled, once per year
 *  7. gamification nudges         — scheduled, at most one per member per day:
 *       gym_streak_at_risk, gym_weekly_goal_reached, gym_leaderboard_rank_up
 *  8. gym_prize_awarded           — on the owner's "Mark prize awarded" (event-driven)
 *
 * 7 and 8 use templates that are OFF until listed in ENABLED_GAMIFICATION_TEMPLATES
 * (config/whatsapp.ts); see runGamificationNudges / sendPrizeAwardedMessage below.
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
import { isWhatsAppEnabledForGym } from './gymGate'
import type { TemplateId, TemplateContext, SendResult } from './sender'
import { enqueueSend, kickDrain } from './queue'
import { finalizeSendRow } from './finalize'
import { reportAlert } from '@/lib/monitoring/alert'
import {
  MAX_REMINDER_SENDS,
  REMINDER_WINDOW_DAYS,
  IMPORT_EXPIRED_WINDOW_DAYS,
  daysUntil,
  isExpiringInWindow,
  isExpiredWithinWindow,
  isBirthdayToday,
  decideScheduledSend,
  type CycleState,
} from './scheduling'
import { isExpiredBeyondReminderWindow } from './reminderWindow'
import { todayIST } from '@/lib/utils'
import { formatMemberId } from '@/types'
import { isGamificationTemplateEnabled } from '@/config/whatsapp'
import { computeStreak } from '@/lib/gamification/streak'
import { addDays, istToday } from '@/lib/gamification/periods'
import { normalizeSettings } from '@/lib/gamification/settings'
import { planAllowsWhatsApp } from '@/lib/subscription-utils'
import { getTrialEligibleMemberIds } from '@/lib/member/trialEligibility'
import {
  NUDGE_PRIORITY,
  RANK_UP_COOLDOWN_DAYS,
  hasSendablePhone,
  selectNudges,
  type NudgeLogRow,
  type NudgeMember,
  type NudgeTemplateId,
} from './gamificationNudges'
import type { AttendanceStamp } from '@/lib/gamification/types'

// ─── DB Client ────────────────────────────────────────────────────────────────

function getAdminClient() {
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

type AdminClient = ReturnType<typeof getAdminClient>

// ─── Types ────────────────────────────────────────────────────────────────────

interface AutomationMember {
  id: string
  gym_id: string
  member_number: number
  name: string
  phone: string
  date_of_birth: string | null
  pending_amount: number
  /** Max end_date over ALL memberships (not just the newest-created); drives the 3-month reminder cutoff. */
  max_end_date?: string | null
  latest_membership: {
    plan: string
    end_date: string
    category?: string
  } | null
}

interface GymRow {
  id: string
  name: string
  plan_type?: string | null
  whatsapp_addon_until?: string | null
}

interface Stats {
  processed: number
  /** Sent inline (event-driven welcome / renewal). */
  sent: number
  /** Enqueued for throttled delivery (scheduled expiry / expired / due / birthday). */
  queued: number
  skipped: number
  failed: number
  errors: string[]
  /** The gamification step of the daily run. All zero while no gym_* template is enabled. */
  gamification: GamificationStats
}

interface GamificationStats {
  /** Gyms the step actually ran for (WhatsApp on, leaderboards on, a template enabled). */
  gyms: number
  /** Nudges enqueued, in total and per template. Also counted in Stats.queued. */
  queued: number
  streakAtRisk: number
  weeklyGoalReached: number
  rankUp: number
  /** Selected but not queued: another run already holds today's slot. */
  skipped: number
  failed: number
}

function newStats(): Stats {
  return {
    processed: 0, sent: 0, queued: 0, skipped: 0, failed: 0, errors: [],
    gamification: { gyms: 0, queued: 0, streakAtRisk: 0, weeklyGoalReached: 0, rankUp: 0, skipped: 0, failed: 0 },
  }
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
    // Ignore 'error' rows (transient/systemic failures) so they never consume a
    // cycle slot or advance the 3-day gate — the next cron run simply retries.
    .in('status', ['sent', 'failed', 'cancelled', 'delivery_failed'])
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
    .in('status', ['sent', 'delivery_failed'])
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
    // Ignore transient 'error' rows so a failed attempt never mis-resolves the
    // cycle (its send_count is a claim placeholder, not a real send count).
    .in('status', ['sent', 'failed', 'cancelled', 'delivery_failed'])
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
    .eq('template_name', '_gymflow_welcome_member')
    .in('status', ['sent', 'delivery_failed'])
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
    .eq('template_name', '_birthday_wishes')
    .in('status', ['sent', 'delivery_failed'])
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
    status: 'sent' | 'failed' | 'skipped' | 'cancelled' | 'error' | 'delivery_failed'
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

// ─── Atomic claim-then-send (prevents duplicate messages under concurrency) ────

/**
 * Atomically claim today's send slot by inserting the 'sent' row BEFORE the
 * message is dispatched. The partial unique index
 *   (member_id, template_name, UTC(sent_at)::date) WHERE status = 'sent'
 * guarantees exactly one claim wins. If a concurrent run — a double-fired cron
 * or a double-submitted event send — already holds today's slot, the insert is
 * rejected as a duplicate and we return { claimed:false } so the caller does
 * NOT send. This closes the check-then-send race that alreadySentToday() alone
 * could not (the old code sent first and recorded second).
 *
 * Returns the new row id so finalizeSend() can attach the message_id / status.
 */
async function claimDailySlot(
  supabase: AdminClient,
  params: {
    gymId: string
    memberId: string
    phone: string
    templateName: string
    cycleKey: string
    sendCount: number
    triggerDate?: string
    metadata?: Record<string, unknown>
  },
): Promise<{ claimed: boolean; id: string | null }> {
  const { data, error } = await supabase
    .from('whatsapp_automation_logs')
    .insert({
      gym_id: params.gymId,
      member_id: params.memberId,
      phone_number: params.phone,
      template_name: params.templateName,
      cycle_key: params.cycleKey,
      send_count: params.sendCount,
      message_id: null,
      status: 'sent',
      error_message: null,
      trigger_date: params.triggerDate ?? null,
      metadata: params.metadata ?? {},
    })
    .select('id')
    .single()

  if (error) {
    // Unique-index violation = another run already claimed today's slot → skip.
    if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
      return { claimed: false, id: null }
    }
    // Any other DB error → treat as not-claimed so we never dispatch a message
    // we failed to record (which would risk an untracked duplicate next run).
    console.error('[WA Automation] claim insert failed:', error.message)
    return { claimed: false, id: null }
  }

  return { claimed: true, id: (data as { id: string } | null)?.id ?? null }
}

// finalizeSend / isTransientFailure now live in ./finalize (shared with the
// queue drain). finalizeSendRow is used directly at every reconcile site.

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

  const { data } = await supabase
    .from('members')
    .select('member_number')
    .eq('id', memberId)
    .limit(1)

  const memberData = data?.[0]

  const ctx: TemplateContext = {
    phone,
    gymName,
    memberName,
    plan,
    startDate,
    memberId: formatMemberId(memberData?.member_number),
  }

  // WhatsApp switched off for this gym: send nothing, and leave no log row behind.
  if (!(await isWhatsAppEnabledForGym(gymId, supabase))) return

  const cycleKey = `_gymflow_welcome_member:${memberId}:${startDate}`

  // Claim before sending so two concurrent submits (double-click / retry) can
  // never both dispatch the welcome message.
  const claim = await claimDailySlot(supabase, {
    gymId,
    memberId,
    phone,
    templateName: '_gymflow_welcome_member',
    cycleKey,
    sendCount: 1,
    triggerDate: startDate,
  })
  if (!claim.claimed) return

  const result = await sendWhatsAppTemplate('_gymflow_welcome_member', { ...ctx, gymId, memberRowId: memberId })
  await finalizeSendRow(supabase, claim.id, result)
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
  const today = todayIST()
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

  // Claim before sending so a double-submitted renewal can't dispatch twice.
  const claim = await claimDailySlot(supabase, {
    gymId,
    memberId,
    phone,
    templateName: 'membership_renewed',
    cycleKey,
    sendCount: 1,
    triggerDate: today,
  })
  if (!claim.claimed) return

  const result = await sendWhatsAppTemplate('membership_renewed', { ...ctx, gymId, memberRowId: memberId })
  await finalizeSendRow(supabase, claim.id, result)
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
 *  - _birthday_wishes            (members whose birthday is today)
 *  - gamification nudges         (streak at risk / weekly goal reached / took the lead),
 *                                only for templates in ENABLED_GAMIFICATION_TEMPLATES
 */
export async function runDailyWhatsAppAutomation(): Promise<Stats> {
  const supabase = getAdminClient()
  const today = todayIST()

  const stats = newStats()

  try {
    // ── Fetch all active gyms ──────────────────────────────────────────────
    const { data: gyms, error: gymErr } = await supabase
      .from('gyms')
      .select('id, name, plan_type, whatsapp_addon_until')
      .eq('onboarding_completed', true)
      // A deactivated gym is read-only; the per-send gate also checks, this saves the work.
      .eq('is_active', true)
      .in('subscription_status', ['active', 'trial'])
      // A gym with WhatsApp switched off is not processed at all: no reminders are worked
      // out, queued or logged for it.
      .eq('whatsapp_enabled', true)

    if (gymErr || !gyms) {
      stats.errors.push(`Failed to fetch gyms: ${gymErr?.message}`)
      return stats
    }

    // Free-plan gyms without the WhatsApp add-on get nothing, same as the per-send gate.
    const nowForPlan = new Date()
    const sendableGyms = (gyms as GymRow[]).filter(g =>
      planAllowsWhatsApp(g.plan_type, g.whatsapp_addon_until, nowForPlan))

    for (const gym of sendableGyms) {
      try {
        await processGym(supabase, gym, today, stats)
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        stats.errors.push(`Gym ${gym.id}: ${msg}`)
        console.error(`[WA Automation] Error processing gym ${gym.id}:`, msg)
      }
    }

    // ── Gamification nudges ────────────────────────────────────────────────
    // After the reminders, so a failure here can never hold back an expiry or due
    // reminder. Same gym list: a gym with WhatsApp switched off is not in it.
    if (enabledNudgeTemplates().length > 0) {
      const now = new Date()
      const settingsByGym = await fetchGamificationSettings(supabase, sendableGyms.map(g => g.id), stats)
      if (settingsByGym) {
        for (const gym of sendableGyms) {
          try {
            await runGamificationNudges(supabase, gym, settingsByGym.get(gym.id) ?? null, now, stats)
          } catch (err) {
            const msg = err instanceof Error ? err.message : String(err)
            stats.errors.push(`Gym ${gym.id} gamification: ${msg}`)
            console.error(`[WA Automation] Gamification step failed for gym ${gym.id}:`, msg)
          }
        }
      }
    }
    // ── Member Web Push (expiring, body progress, we-miss-you, weekly quote) ──
    // Last and fully isolated: a push failure must never fail or alter the WhatsApp run. Not a Vercel cron;
    // it rides this one (09:00 IST, inside the 07:00-21:00 push window). No-op unless VAPID is configured.
    try {
      const { isPushConfigured } = await import('@/lib/push/config')
      if (isPushConfigured()) {
        const { runDailyPushStep } = await import('@/lib/push/daily')
        await runDailyPushStep()
      }
    } catch (err) {
      console.error('[WA Automation] Push step failed:', err instanceof Error ? err.message : String(err))
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    stats.errors.push(`Fatal: ${msg}`)
  }

  // One alert per run (not per gym): per-gym failures are caught above so the run continues, which
  // would otherwise hide them. Keyed so repeated runs de-duplicate.
  const gymErrors = stats.errors.filter(e => e.startsWith('Gym ')).length
  if (gymErrors > 0) {
    await reportAlert({ key: 'wa:daily_gym_error', severity: 'warning', title: 'WhatsApp daily run had gym errors',
      body: `${gymErrors} gym(s) failed during the daily WhatsApp automation run.` })
  }

  // Start draining the freshly enqueued sends (best-effort; the queue persists).
  if (stats.queued > 0) await kickDrain().catch(() => {})

  return stats
}

/**
 * Immediately send expiry/expired reminders for a freshly imported batch of
 * members — so an import doesn't have to wait for the next daily cron run.
 *
 * Only 'membership_expiry_reminder' and 'membership_expired' fire here. The
 * expired window is widened to IMPORT_EXPIRED_WINDOW_DAYS (2 months): imported
 * members expired longer than that are considered long-inactive and receive
 * nothing. Invalid phones (INVALID_NUMBER / < 10 digits) are skipped. All sends
 * reuse the standard idempotency, so the daily cron won't re-send the same day.
 *
 * Called (fire-and-forget) from the import confirm flow via
 * POST /api/whatsapp/automation/import-batch.
 */
export async function runImportBatchAutomation({
  gymId,
  memberIds,
}: {
  gymId: string
  memberIds: string[]
}): Promise<Stats> {
  const stats = newStats()
  if (!memberIds.length) return stats

  const supabase = getAdminClient()
  const today = todayIST()

  const { data: gymRow, error: gymErr } = await supabase
    .from('gyms')
    .select('id, name, whatsapp_enabled')
    .eq('id', gymId)
    .single()

  if (gymErr || !gymRow) {
    stats.errors.push(`Import batch: gym ${gymId} not found: ${gymErr?.message}`)
    return stats
  }
  // Switched off for this gym: the import still succeeds, it just sends no reminders.
  if ((gymRow as { whatsapp_enabled?: boolean }).whatsapp_enabled === false) {
    stats.skipped += memberIds.length
    return stats
  }
  const gym = gymRow as GymRow

  const { data: members, error } = await supabase
    .from('members')
    .select(`
      id, gym_id, member_number, name, phone, date_of_birth, pending_amount,
      memberships!fk_memberships_member_same_gym(plan, end_date, category, created_at)
    `)
    .eq('gym_id', gymId)
    .in('id', memberIds)

  if (error || !members) {
    stats.errors.push(`Import batch member fetch: ${error?.message}`)
    return stats
  }

  for (const rawMember of members as any[]) {
    const phone: string = rawMember.phone ?? ''
    // Skip invalid phones (INVALID_NUMBER sentinel has 0 digits).
    if (!phone || phone.replace(/\D/g, '').length < 10) {
      stats.skipped++
      continue
    }

    const member = toAutomationMember(rawMember)
    stats.processed++

    try {
      await processExpiryExpired(supabase, gym, member, today, stats, IMPORT_EXPIRED_WINDOW_DAYS)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      stats.errors.push(`Import batch member ${rawMember.id}: ${msg}`)
      stats.failed++
    }
  }

  // Kick off throttled delivery of the batch we just enqueued (first 5 go now).
  if (stats.queued > 0) await kickDrain().catch(() => {})

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
      id, gym_id, member_number, name, phone, date_of_birth, pending_amount,
      memberships!fk_memberships_member_same_gym(plan, end_date, category, created_at)
    `)
    .eq('gym_id', gym.id)
    .not('phone', 'is', null)

  if (error || !members) {
    stats.errors.push(`Gym ${gym.id} member fetch: ${error?.message}`)
    return
  }

  // Trial gyms only cover their first 50 members (same set as the member app gate); later ones
  // get no scheduled sends. If the lookup fails, skip the gym rather than message uncovered members.
  let trialEligible: Set<string> | null = null
  if (gym.plan_type === 'trial') {
    try {
      trialEligible = await getTrialEligibleMemberIds(supabase, gym.id)
    } catch (err) {
      stats.errors.push(`Gym ${gym.id} trial eligibility: ${(err as Error)?.message}`)
      return
    }
  }

  for (const rawMember of members as any[]) {
    if (trialEligible && !trialEligible.has(rawMember.id)) {
      stats.skipped++
      continue
    }
    const phone: string = rawMember.phone ?? ''
    // Skip invalid phones
    if (!phone || phone.replace(/\D/g, '').length < 10) continue

    const member = toAutomationMember(rawMember)

    stats.processed++

    // ── 1. Expiry / expired reminders (standard 18-day expired window) ─────
    await processExpiryExpired(supabase, gym, member, today, stats)

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
        // Claim first so a double-fired cron can't send two birthday wishes.
        const claim = await claimDailySlot(supabase, {
          gymId: gym.id,
          memberId: member.id,
          phone,
          templateName: '_birthday_wishes',
          cycleKey: `_birthday_wishes:${member.id}:${year}`,
          sendCount: 1,
          triggerDate: today,
        })
        if (!claim.claimed) {
          stats.skipped++
        } else {
          // Enqueue for throttled delivery; the slot is already claimed so the
          // log row is reconciled by the drain via finalizeSendRow.
          const enq = await enqueueSend(supabase, {
            gymId: gym.id,
            memberId: member.id,
            templateName: '_birthday_wishes',
            context: { phone, gymName: gym.name, memberName: member.name },
            cycleKey: `_birthday_wishes:${member.id}:${year}`,
            triggerDate: today,
            logRowId: claim.id,
          })
          if (enq.enqueued) {
            stats.queued++
          } else {
            // Couldn't enqueue — release the claimed slot so the next run retries.
            await finalizeSendRow(supabase, claim.id, { success: false, error: 'enqueue failed' })
            stats.failed++
          }
        }
      }
    }
  }
}

/**
 * Build the internal AutomationMember shape from a raw members+memberships row,
 * resolving the latest membership by created_at. Shared by the daily cron and
 * the import-time batch send so both see identical membership resolution.
 */
function toAutomationMember(rawMember: any): AutomationMember {
  const memberships = (rawMember.memberships ?? []) as { plan: string; end_date: string; created_at: string }[]
  const latestMs = memberships
    .slice()
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null

  return {
    id: rawMember.id,
    gym_id: rawMember.gym_id,
    member_number: rawMember.member_number,
    name: rawMember.name,
    phone: rawMember.phone ?? '',
    date_of_birth: rawMember.date_of_birth ?? null,
    pending_amount: rawMember.pending_amount ?? 0,
    max_end_date: memberships.reduce<string | null>((m, x) => (x.end_date && (!m || x.end_date > m) ? x.end_date : m), null),
    latest_membership: latestMs
      ? { plan: latestMs.plan, end_date: latestMs.end_date }
      : null,
  }
}

/**
 * Send the expiry-reminder / expired templates for one member.
 *
 * `expiredWindowDays` bounds how far past expiry the 'membership_expired'
 * template still fires: the daily cron uses the standard 18-day window; the
 * import-time send widens it to 2 months (IMPORT_EXPIRED_WINDOW_DAYS) so
 * recently-lapsed imports are notified once, while members expired longer than
 * that are treated as long-inactive and skipped.
 *
 * Cadence & idempotency come from tryScheduledSend, so a send here and the
 * daily cron can never double-message the same member+template on the same day.
 */
async function processExpiryExpired(
  supabase: AdminClient,
  gym: GymRow,
  member: AutomationMember,
  today: string,
  stats: Stats,
  expiredWindowDays: number = REMINDER_WINDOW_DAYS,
): Promise<void> {
  if (!member.latest_membership) return
  const endDate = member.latest_membership.end_date
  const phone = member.phone

  // Expired more than 3 months ago (by the latest end_date across all memberships, so a renewed
  // member is unaffected): no reminder at all, even for the import-time window.
  if (isExpiredBeyondReminderWindow(member.max_end_date ?? endDate, today)) {
    stats.skipped++
    return
  }

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
  } else if (isExpiredWithinWindow(endDate, today, expiredWindowDays)) {
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
        memberId: formatMemberId(member.member_number),
      },
      stats,
    })
  }
}

/**
 * Attempt a scheduled cyclic send (expiry / expired / due reminders).
 * Cadence & cancellation are enforced by decideScheduledSend(); the actual
 * dispatch is deferred to the throttled queue (enqueueSend + drain).
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

  // Atomically claim today's slot BEFORE sending. If a concurrent run already
  // holds it (double-fired cron), the unique index rejects this insert and we
  // must NOT send — preventing a duplicate message.
  const claim = await claimDailySlot(supabase, {
    gymId: gym.id,
    memberId: member.id,
    phone: member.phone,
    templateName,
    cycleKey,
    sendCount: state.sendCount + 1,
    triggerDate,
    metadata: { daysRemaining: ctx.daysRemaining, dueAmount: ctx.dueAmount },
  })
  if (!claim.claimed) {
    stats.skipped++
    return
  }

  // Enqueue for throttled delivery instead of sending inline. The claimed slot
  // reserves idempotency now; the drain sends later and reconciles claim.id via
  // finalizeSendRow (message id on success, 'failed'/'error' on failure).
  const enq = await enqueueSend(supabase, {
    gymId: gym.id,
    memberId: member.id,
    templateName,
    context: ctx,
    cycleKey,
    triggerDate,
    logRowId: claim.id,
  })

  if (enq.enqueued) {
    stats.queued++
  } else {
    // Couldn't enqueue — release the claimed slot so the next run retries.
    await finalizeSendRow(supabase, claim.id, { success: false, error: 'enqueue failed' })
    stats.failed++
  }
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
      // Ignore transient 'error' rows — consistent with getCycleState() and
      // resolveDueCycleKey(). Without this filter, a transient failure could be
      // picked as the "latest" row, causing us to either skip cancellation
      // (if its status isn't 'cancelled') or cancel the wrong cycle_key.
      .in('status', ['sent', 'failed', 'cancelled', 'delivery_failed'])
      .order('sent_at', { ascending: false })
      .limit(1)

    if (!data || data.length === 0) continue

    const latest = data[0] as { cycle_key: string; send_count: number; status: string }

    // Only skip if this cycle is ALREADY cancelled (idempotent — avoids stacking
    // duplicate sentinels). A *completed* cycle (send_count >= MAX) must still get
    // a 'cancelled' sentinel: otherwise resolveDueCycleKey() sees the exhausted
    // cycle as the latest row and returns null forever, so a later re-incurred due
    // (member paid, then owes again) would never restart its reminder cycle.
    if (latest.status === 'cancelled') continue

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

// ─── Gamification nudges (scheduled, inside the daily run) ────────────────────

/** Attendance loaded for every member of a gym: enough for the 7-day board plus a margin. */
const NUDGE_WINDOW_DAYS = 10
/**
 * A streak that fills the whole first window may be longer than the window, so those few
 * members get a second, deeper read. A streak older than this is reported as this long.
 */
const STREAK_LOOKBACK_DAYS = 400
/** PostgREST returns at most 1000 rows per request; a busy gym has more attendance than that. */
const PAGE_SIZE = 1000
/** Ids per `.in()` filter, to keep the request URL short. */
const ID_CHUNK = 100

/** The scheduled nudge templates that are switched on, in priority order. Empty by default. */
function enabledNudgeTemplates(): NudgeTemplateId[] {
  return NUDGE_PRIORITY.filter(template => isGamificationTemplateEnabled(template))
}

/** Read every row of a query, one page at a time. The query must have a stable order. */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: { message?: string } | null }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message ?? 'query failed')
    const batch = (data ?? []) as T[]
    rows.push(...batch)
    if (batch.length < PAGE_SIZE) return rows
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Settings rows for the gyms of this run, keyed by gym id. A gym with no row is simply
 * absent (it uses the defaults). Returns null when the read failed: "no row" means
 * leaderboards are ON, so an unreadable table must not be mistaken for it.
 */
async function fetchGamificationSettings(
  supabase: AdminClient,
  gymIds: string[],
  stats: Stats,
): Promise<Map<string, unknown> | null> {
  const byGym = new Map<string, unknown>()
  for (const ids of chunk(gymIds, ID_CHUNK)) {
    const { data, error } = await supabase
      .from('gym_gamification_settings')
      .select('gym_id, leaderboards_enabled, weekly_goal_days')
      .in('gym_id', ids)
    if (error) {
      stats.errors.push(`Gamification settings fetch: ${error.message}`)
      return null
    }
    for (const row of (data ?? []) as Array<{ gym_id: string }>) byGym.set(row.gym_id, row)
  }
  return byGym
}

/**
 * The gamification step of the daily run, for ONE gym: work out today's nudges and put
 * them on the send queue.
 *
 * Runs only when all three hold, checked in this order and before anything is written:
 *   1. at least one nudge template is in ENABLED_GAMIFICATION_TEMPLATES (none by default),
 *   2. the gym has WhatsApp on (the caller only passes gyms from the daily list, which
 *      filters on gyms.whatsapp_enabled; sendTemplate checks it again at send time),
 *   3. the gym has leaderboards on (gym_gamification_settings; no row = on).
 *
 * Cost per gym: members, one attendance read for the last NUDGE_WINDOW_DAYS days, and the
 * recent gamification log rows. Who gets what is decided by the pure selectNudges().
 *
 * Idempotent like the reminders: each nudge claims the member's daily slot for that
 * template before it is queued, and a member who already has a gamification row today
 * is not selected at all, so a second run on the same day queues nothing.
 *
 * `gym` must be a server-resolved gym (here: a row the service-role client just read).
 */
export async function runGamificationNudges(
  supabase: AdminClient,
  gym: GymRow,
  settingsRow: unknown,
  now: Date,
  stats: Stats,
): Promise<void> {
  const enabled = enabledNudgeTemplates()
  if (enabled.length === 0) return

  const settings = normalizeSettings(settingsRow)
  if (!settings.leaderboardsEnabled) return

  const g = stats.gamification
  g.gyms++

  const today = istToday(now)

  const members = await fetchAllRows<{ id: string; name: string; phone: string | null; show_on_leaderboard: boolean | null }>(
    (from, to) => supabase
      .from('members')
      .select('id, name, phone, show_on_leaderboard')
      .eq('gym_id', gym.id)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (members.length === 0) return

  type AttendanceRow = { member_id: string; date: string; created_at: string | null }
  const attendance = await fetchAllRows<AttendanceRow>((from, to) => supabase
    .from('attendance')
    .select('member_id, date, created_at')
    .eq('gym_id', gym.id)
    .gte('date', addDays(today, -(NUDGE_WINDOW_DAYS - 1)))
    .order('id', { ascending: true })
    .range(from, to))
  // Nobody came in during the window: no streak, no goal, no board.
  if (attendance.length === 0) return

  const rowsByMember = new Map<string, AttendanceStamp[]>()
  const collect = (rows: AttendanceRow[], into: Map<string, AttendanceStamp[]>) => {
    for (const row of rows) {
      const list = into.get(row.member_id)
      const stamp = { date: row.date, createdAt: row.created_at }
      if (list) list.push(stamp)
      else into.set(row.member_id, [stamp])
    }
  }
  collect(attendance, rowsByMember)

  // A streak that reaches the edge of the window is cut off by it. Re-read those members
  // further back so the number in the message is the real one.
  const longStreakIds = [...rowsByMember.entries()]
    .filter(([, rows]) => computeStreak(rows, now).streak >= NUDGE_WINDOW_DAYS - 2)
    .map(([memberId]) => memberId)
  if (enabled.includes('gym_streak_at_risk') && longStreakIds.length > 0) {
    const deep = new Map<string, AttendanceStamp[]>()
    for (const ids of chunk(longStreakIds, ID_CHUNK)) {
      collect(
        await fetchAllRows<AttendanceRow>((from, to) => supabase
          .from('attendance')
          .select('member_id, date, created_at')
          .eq('gym_id', gym.id)
          .in('member_id', ids)
          .gte('date', addDays(today, -STREAK_LOOKBACK_DAYS))
          .order('id', { ascending: true })
          .range(from, to)),
        deep,
      )
    }
    for (const [memberId, rows] of deep) rowsByMember.set(memberId, rows)
  }

  // Recent gamification rows for the caps. 'error' rows are left out, as everywhere else:
  // a released slot (transient failure, gym switched off) must not count as a message.
  const since = new Date(now.getTime() - (RANK_UP_COOLDOWN_DAYS + 1) * 86_400_000).toISOString()
  const logRows = await fetchAllRows<{ member_id: string; template_name: string; cycle_key: string; sent_at: string }>(
    (from, to) => supabase
      .from('whatsapp_automation_logs')
      .select('member_id, template_name, cycle_key, sent_at')
      .eq('gym_id', gym.id)
      .in('template_name', [...NUDGE_PRIORITY])
      .in('status', ['sent', 'failed', 'delivery_failed'])
      .gte('sent_at', since)
      .order('id', { ascending: true })
      .range(from, to),
  )
  const history: NudgeLogRow[] = logRows.map(r => ({
    memberId: r.member_id,
    templateName: r.template_name,
    cycleKey: r.cycle_key,
    sentAt: r.sent_at,
  }))

  const nudgeMembers: NudgeMember[] = members.map(m => ({
    id: m.id,
    name: m.name,
    phone: m.phone,
    // The column defaults to true; only an explicit false is an opt-out.
    showOnLeaderboard: m.show_on_leaderboard !== false,
    attendance: rowsByMember.get(m.id) ?? [],
  }))

  const picks = selectNudges({
    members: nudgeMembers,
    weeklyGoalDays: settings.weeklyGoalDays,
    isEnabled: template => enabled.includes(template),
    history,
    now,
  })

  for (const pick of picks) {
    // Claim before queueing, exactly like the reminders: if an overlapping run already
    // holds this member's slot for this template today, the unique index rejects the
    // insert and nothing is queued.
    const claim = await claimDailySlot(supabase, {
      gymId: gym.id,
      memberId: pick.memberId,
      phone: pick.phone,
      templateName: pick.template,
      cycleKey: pick.cycleKey,
      sendCount: 1,
      triggerDate: pick.triggerDate,
      metadata: pick.context,
    })
    if (!claim.claimed) {
      g.skipped++
      continue
    }

    const enq = await enqueueSend(supabase, {
      gymId: gym.id,
      memberId: pick.memberId,
      templateName: pick.template,
      context: { phone: pick.phone, gymName: gym.name, memberName: pick.memberName, ...pick.context },
      cycleKey: pick.cycleKey,
      triggerDate: pick.triggerDate,
      logRowId: claim.id,
    })

    if (enq.enqueued) {
      stats.queued++ // so the run kicks the drain
      g.queued++
      if (pick.template === 'gym_streak_at_risk') g.streakAtRisk++
      else if (pick.template === 'gym_weekly_goal_reached') g.weeklyGoalReached++
      else g.rankUp++
    } else {
      // Couldn't enqueue — release the claimed slot so the next run retries.
      await finalizeSendRow(supabase, claim.id, { success: false, error: 'enqueue failed' })
      g.failed++
    }
  }
}

// ─── Gamification prize (event-driven) ────────────────────────────────────────

export interface PrizeMessageResult {
  sent: boolean
  /** Why nothing was sent. Absent when sent is true. */
  reason?:
    | 'template_disabled'
    | 'whatsapp_disabled'
    | 'not_found'
    | 'no_phone'
    | 'already_sent'
    | 'send_failed'
  error?: string
}

/**
 * Tell a member they have been given a prize (template gym_prize_awarded). Sent inline with
 * claim-then-send, like the welcome and renewal messages. Never throws.
 *
 * Call it from the owner's "Mark prize awarded" server action, AFTER the gamification_awards
 * row is written, with the gym the action resolved on the server (never an id from the
 * request). It need not block the response:
 *
 *   const gym = ...                                // resolved on the server for this owner
 *   // ...insert into gamification_awards...
 *   void sendPrizeAwardedMessage({ gymId: gym.id, memberId, prize, periodLabel, board })
 *
 * The member is looked up inside that gym, so a member id from another gym sends nothing.
 * Safe to call twice: the same member + board + period is messaged once. Returns
 * { sent: false, reason: 'template_disabled' } and touches nothing until gym_prize_awarded
 * is in ENABLED_GAMIFICATION_TEMPLATES.
 *
 * Note: the claim index allows one gym_prize_awarded message per member per day, so a
 * second prize marked for the same member on the same day is recorded but not messaged.
 */
export async function sendPrizeAwardedMessage({
  gymId,
  memberId,
  prize,
  periodLabel,
  board,
}: {
  gymId: string
  memberId: string
  prize: string
  periodLabel: string
  /** The board the prize is for ('week', 'month', ...). Only used to tell two awards apart. */
  board?: string
}): Promise<PrizeMessageResult> {
  // Before anything else: an un-enabled template reads and writes nothing.
  if (!isGamificationTemplateEnabled('gym_prize_awarded')) return { sent: false, reason: 'template_disabled' }

  try {
    const prizeText = prize.trim()
    const period = periodLabel.trim()
    if (!prizeText || !period) return { sent: false, reason: 'send_failed', error: 'Prize and period are required' }

    const supabase = getAdminClient()

    const { data: gym } = await supabase
      .from('gyms')
      .select('id, name, whatsapp_enabled')
      .eq('id', gymId)
      .maybeSingle()
    if (!gym) return { sent: false, reason: 'not_found' }
    // WhatsApp switched off for this gym: send nothing, and leave no log row behind.
    if ((gym as { whatsapp_enabled?: boolean | null }).whatsapp_enabled === false) {
      return { sent: false, reason: 'whatsapp_disabled' }
    }

    const { data: member } = await supabase
      .from('members')
      .select('id, name, phone')
      .eq('id', memberId)
      .eq('gym_id', gymId)
      .maybeSingle()
    if (!member) return { sent: false, reason: 'not_found' }

    const { name, phone } = member as { name: string; phone: string | null }
    if (!hasSendablePhone(phone)) return { sent: false, reason: 'no_phone' }

    const cycleKey = `gym_prize_awarded:${memberId}:${board ?? 'board'}:${period}`

    const { data: earlier } = await supabase
      .from('whatsapp_automation_logs')
      .select('id')
      .eq('member_id', memberId)
      .eq('template_name', 'gym_prize_awarded')
      .eq('cycle_key', cycleKey)
      .in('status', ['sent', 'failed', 'delivery_failed'])
      .limit(1)
    if (earlier && earlier.length > 0) return { sent: false, reason: 'already_sent' }

    // Claim before sending so a double tap on "Mark prize awarded" can't dispatch twice.
    const claim = await claimDailySlot(supabase, {
      gymId,
      memberId,
      phone,
      templateName: 'gym_prize_awarded',
      cycleKey,
      sendCount: 1,
      triggerDate: istToday(),
      metadata: { prize: prizeText, periodLabel: period, board: board ?? null },
    })
    if (!claim.claimed) return { sent: false, reason: 'already_sent' }

    const result = await sendWhatsAppTemplate('gym_prize_awarded', {
      phone,
      gymName: (gym as { name: string }).name,
      memberName: name,
      prize: prizeText,
      periodLabel: period,
      gymId,
      memberRowId: memberId,
    })
    await finalizeSendRow(supabase, claim.id, result)

    if (result.success) return { sent: true }
    return result.skipped
      ? { sent: false, reason: 'whatsapp_disabled', error: result.error }
      : { sent: false, reason: 'send_failed', error: result.error }
  } catch (err) {
    return { sent: false, reason: 'send_failed', error: err instanceof Error ? err.message : String(err) }
  }
}
