import type { SupabaseClient } from '@supabase/supabase-js'
import { gymIsWritable, planAllowsMemberApp, type GymSubscriptionFields } from '@/lib/subscription-utils'
import { getTrialEligibleMemberIds } from '@/lib/member/trialEligibility'

export const MEMBER_APP_NOT_INCLUDED_MESSAGE = 'The Member App is not included in your plan. Upgrade to a paid plan.'

type MemberAppGym = GymSubscriptionFields & { is_active?: boolean | null }

/**
 * Whether the owner may manage the Member App at all (invite, enable, reactivate). Free gyms do
 * not have it, and a lapsed gym is read-only. The member-side gate decides who can sign in; this
 * stops the owner side from creating logins and sending invitations the plan does not cover.
 */
export function gymMayManageMemberApp(gym: MemberAppGym | null | undefined): boolean {
  return !!gym && planAllowsMemberApp(gym.plan_type) && gymIsWritable(gym)
}

/**
 * Splits member ids into those the plan covers and a skipped count. A trial covers only its first
 * PLAN_MEMBER_LIMIT members (getTrialEligibleMemberIds, the same rule the member gate and the
 * WhatsApp cron use); paid plans cover everyone. Throws on a query error so callers fail closed.
 */
export async function splitMemberAppEligible(
  db: SupabaseClient,
  gym: MemberAppGym & { id: string },
  memberIds: string[],
): Promise<{ allowed: string[]; skipped: number }> {
  if (gym.plan_type !== 'trial') return { allowed: memberIds, skipped: 0 }
  const eligible = await getTrialEligibleMemberIds(db, gym.id)
  const allowed = memberIds.filter(id => eligible.has(id))
  return { allowed, skipped: memberIds.length - allowed.length }
}
