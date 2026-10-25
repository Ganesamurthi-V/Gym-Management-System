import type { SupabaseClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { planAllowsWhatsApp, gymIsWritable } from '@/lib/subscription-utils'
import { getTrialEligibleMemberIds } from '@/lib/member/trialEligibility'

/**
 * The per-gym WhatsApp switch.
 *
 * The platform admin can turn WhatsApp off for one gym (Manage Subscription → "WhatsApp
 * Enabled", stored as gyms.whatsapp_enabled). While it is off, nothing may be sent to that
 * gym's members: not the daily reminders, not the welcome or renewal message, not a queued
 * send that was already waiting, not an invitation. Other gyms are unaffected.
 *
 * Read fresh from the database on every check and never cached, like the other access
 * switches (gyms.is_active, the subscription columns): a cache here would let sends keep
 * going for the cache lifetime after the admin turned it off. Uses the service-role client
 * because the callers (cron, queue drain) have no logged-in user, and it only reads the one
 * flag of the gym it is asked about.
 */

export const WHATSAPP_DISABLED_MESSAGE = 'WhatsApp is turned off for this gym'

export type GymWhatsAppState = 'enabled' | 'disabled' | 'unknown'

/**
 * The gym's switch, or 'unknown' if it could not be read (the caller then does not send).
 *
 * `member` selects the trial coverage rule: a trial gym messages only its first 50 members.
 *   - undefined: gym-level question ("is this gym on at all?"), no member rule applied;
 *   - a members.id: that member must be among the trial's first 50, else 'disabled';
 *   - null: a member-facing send whose member is unknown. On a trial gym that is denied
 *     (fail closed), because coverage cannot be shown; other plans are unaffected.
 */
export async function getGymWhatsAppState(
  gymId: string,
  client?: SupabaseClient,
  member?: string | null,
): Promise<GymWhatsAppState> {
  try {
    // A caller that already holds a service-role client (the automation, which runs without a
    // user) passes it in. Otherwise the admin client is loaded here, not at the top: it is a
    // server-only module, and importing it eagerly would make every module that imports the
    // sender (and its tests) pull it in.
    const db = client ?? (await import('@/lib/supabase/admin')).createAdminClient()
    const { data, error } = await db
      .from('gyms')
      .select('whatsapp_enabled, plan_type, whatsapp_addon_until, is_active, subscription_status, trial_ends_at, subscription_ends_at')
      .eq('id', gymId)
      .maybeSingle()
    if (error) throw error
    if (!data) return 'unknown'
    // Only an explicit false switches it off; the column defaults to true.
    if (data.whatsapp_enabled === false) return 'disabled'
    // A suspended, cancelled, deactivated or expired gym is read-only: nothing is sent for it,
    // including rows that were queued while it was still active.
    if (!gymIsWritable(data)) return 'disabled'
    // A Free gym sends only while its paid WhatsApp add-on runs. Read here with the switch
    // (fresh, uncached) so every send path that checks the gate enforces the plan too.
    if (!planAllowsWhatsApp(data.plan_type, data.whatsapp_addon_until, new Date())) return 'disabled'
    // Trial: only the first 50 members are covered. Checked per send, not only in the daily
    // cron, because welcome, renewal, prize and invitation sends skip the cron. One indexed
    // LIMIT-50 query, and only for trial gyms.
    if (data.plan_type === 'trial' && member !== undefined) {
      if (member === null) return 'disabled'
      const eligible = await getTrialEligibleMemberIds(db, gymId)
      if (!eligible.has(member)) return 'disabled'
    }
    return 'enabled'
  } catch (err) {
    logger.error('gymGate: could not read whatsapp_enabled', err)
    return 'unknown'
  }
}

/**
 * True only when the gym is known to have WhatsApp on. An unreadable switch counts as "do not
 * send": an unwanted message to a member cannot be taken back, a delayed one can be retried.
 */
export async function isWhatsAppEnabledForGym(gymId: string, client?: SupabaseClient): Promise<boolean> {
  return (await getGymWhatsAppState(gymId, client)) === 'enabled'
}
