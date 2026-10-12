'use server'

/**
 * app/member-app/actions.ts
 *
 * Server Actions for the Member App Management module.
 * Each action verifies ownership, performs the mutation, logs portal activity,
 * and invalidates the Redis cache so the next navigation reflects changes.
 */

import { createClient } from '@/lib/supabase/server'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { hasOwnerRegistrationMarker } from '@/lib/auth/owner-registration'
import { z } from 'zod'
import { getAuthUser, getGym } from '@/lib/dal'
import { logger } from '@/lib/logger'
import { leaderboardRpcArgs, mapLeaderboard } from '@/lib/gamification/mapLeaderboard'
import {
  GAMIFICATION_SETTINGS_COLUMNS,
  gamificationSettingsPatchSchema,
  normalizeSettings,
} from '@/lib/gamification/settings'
import {
  PRIZE_BOARDS,
  awardPeriodLabel,
  badgeRulesProblem,
  fieldErrors,
  mapAward,
  patchToRow,
  pickLeaders,
  prizeFor,
} from '@/features/member-app/utils/gamificationConfig'
import type {
  ActionResult,
  GamificationAwardResult,
  GamificationSettingsResult,
  MemberActivityType,
  MemberBulkAction,
  MemberRowAction,
} from '@/types/member-app'

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOwnerGymId(): Promise<string | null> {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', session.user.id)
    .single()

  return gym?.id ?? null
}

async function logActivity(gymId: string, memberId: string, activity: MemberActivityType) {
  const supabase = await createClient()
  await supabase.from('member_portal_activity').insert({
    gym_id: gymId,
    member_id: memberId,
    activity,
    performed_by: 'owner',
  })
}

async function invalidateMemberAppCache(gymId: string) {
  await deleteCache(cacheKeys.memberApp(gymId))
}

/**
 * Issues a real invitation for one member: ensures an Auth identity exists,
 * mints a fresh token, stamps portal status, and sends the WhatsApp template.
 *
 * Extracted so the bulk path uses the SAME logic. Previously
 * `bulk_send_invitation` only set `invitation_status = 'pending'` — it created no
 * token and sent no message, so the table showed members as invited while no
 * invitation existed. Anyone who reached /activate then failed verification
 * because there was nothing to verify against.
 */
async function issueInvitation(gymId: string, memberId: string): Promise<ActionResult> {
  const serviceUrl = process.env.SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceUrl || !serviceKey) {
    return { success: false, message: 'The server is not configured for member invitations. Please contact support.' }
  }

  const supabase = await createClient()
  const { createClient: createServiceClient } = await import('@supabase/supabase-js')
  const serviceSupabase = createServiceClient(serviceUrl, serviceKey)
  const { randomBytes } = await import('crypto')
  const { generateInvitationToken, reusableInvitationToken } = await import('@/lib/member-invitation')

  const { data: memberData } = await supabase
    .from('members')
    .select('id, name, phone, email, auth_user_id, portal_suspended, invitation_status')
    .eq('id', memberId)
    .eq('gym_id', gymId)
    .single()

  if (!memberData) return { success: false, message: 'Member not found in your gym' }
  if (!memberData.phone) return { success: false, message: 'This member has no phone number. Add one before inviting.' }
  if (memberData.portal_suspended) {
    return { success: false, message: 'This member\'s access is suspended. Reactivate it before sending an invitation.' }
  }

  let authUserId = memberData.auth_user_id

  if (!authUserId) {
    const email = memberData.email || `member-${memberId.slice(0, 8)}@gymflow.sbs`
    const tempPassword = randomBytes(16).toString('base64url')

    const { data: authData, error: authCreateErr } = await serviceSupabase.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { member_id: memberId, gym_id: gymId, role: 'member' },
      app_metadata: { role: 'member' },
    })

    if (authCreateErr || !authData.user) {
      if (authCreateErr?.message?.includes('already been registered')) {
        // Page through users instead of reading only the first page.
        let foundUser: { id: string; user_metadata?: Record<string, unknown> } | null = null
        for (let page = 1; page <= 50 && !foundUser; page++) {
          const { data: list } = await serviceSupabase.auth.admin.listUsers({ page, perPage: 1000 })
          if (!list) break
          foundUser = list.users.find((user) => user.email === email) ?? null
          if (list.users.length < 1000) break
        }

        const belongsToThisMember =
          foundUser?.user_metadata?.role === 'member' &&
          foundUser.user_metadata.member_id === memberId &&
          foundUser.user_metadata.gym_id === gymId

        if (foundUser && belongsToThisMember) authUserId = foundUser.id
        else return { success: false, message: 'This email is already linked to another account. Use a different member email.' }
      } else {
        return { success: false, message: 'Could not set up the member account. Please try again.' }
      }
    } else {
      authUserId = authData.user.id
    }

    const { error: memberLinkError } = await serviceSupabase
      .from('members')
      .update({ auth_user_id: authUserId })
      .eq('id', memberId)
      .eq('gym_id', gymId)

    if (memberLinkError) {
      console.error('[member-app/invitation] member auth link failed:', memberLinkError.message)
      return { success: false, message: 'Could not set up the member account. Please try again.' }
    }
  }

  const { data: authUserData, error: authUserError } =
    await serviceSupabase.auth.admin.getUserById(authUserId!)
  const authUser = authUserData.user

  if (authUserError || !authUser) {
    console.error('[member-app/invitation] could not load member auth user:', authUserError?.message ?? 'no user')
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { data: ownerGym, error: ownerGymError } = await serviceSupabase
    .from('gyms')
    .select('id')
    .eq('owner_id', authUser.id)
    .maybeSingle()

  if (ownerGymError) {
    console.error('[member-app/invitation] owner identity check failed:', ownerGymError.message)
    return { success: false, message: 'Could not verify the member account. Please try again.' }
  }

  if (ownerGym?.id || hasOwnerRegistrationMarker(authUser)) {
    return { success: false, message: 'This email belongs to a gym owner account. Use a different member email.' }
  }

  const linkedMemberId = authUser.user_metadata?.member_id
  if (typeof linkedMemberId === 'string' && linkedMemberId !== memberId) {
    return { success: false, message: 'This email is already linked to another member account.' }
  }

  const existingToken = memberData.invitation_status === 'pending'
    ? reusableInvitationToken(
        authUser.user_metadata?.invitation_token,
        authUser.user_metadata?.invited_at,
        memberId,
        authUser.user_metadata?.member_id,
      )
    : null
  const token = existingToken ?? generateInvitationToken(memberId)
  const invitedAt = existingToken
    ? String(authUser.user_metadata.invited_at)
    : new Date().toISOString()

  // Reuse an unexpired pending token so an uncertain Meta response cannot make
  // an already-delivered link invalid. Explicitly clear half-finished activation
  // fields while preserving unrelated user metadata.
  const { error: tokenError } = await serviceSupabase.auth.admin.updateUserById(authUserId!, {
    user_metadata: {
      ...authUser.user_metadata,
      invitation_token: token,
      invited_at: invitedAt,
      gym_id: gymId,
      member_id: memberId,
      role: 'member',
      pending_email: null,
      activation_step: null,
      activated_at: null,
    },
    app_metadata: {
      ...authUser.app_metadata,
      role: 'member',
    },
  })

  if (tokenError) {
    console.error('[member-app/invitation] token update failed:', tokenError.message)
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { error: statusError } = await serviceSupabase
    .from('members')
    .update({
      portal_enabled: true,
      invitation_status: 'pending',
      invitation_sent_at: new Date().toISOString(),
      portal_activated_at: null,
    })
    .eq('id', memberId)
    .eq('gym_id', gymId)

  if (statusError) {
    console.error('[member-app/invitation] member status update failed:', statusError.message)
    return { success: false, message: 'Could not set up the member invitation. Please try again.' }
  }

  const { sendWhatsAppTemplate } = await import('@/lib/whatsapp/sender')
  const { data: gymData } = await supabase.from('gyms').select('name').eq('id', gymId).single()

  const sendResult = await sendWhatsAppTemplate('member_app_invitation', {
    phone: memberData.phone,
    gymName: gymData?.name ?? 'Your Gym',
    memberName: memberData.name,
    invitationToken: token,
  })

  if (sendResult.success) {
    return {
      success: true,
      message: `Invitation sent to ${memberData.name} via WhatsApp`,
      invitationCreated: true,
      whatsappSent: true,
    }
  }

  // Keep provider/configuration details in server logs. The owner only needs
  // an accurate, actionable outcome; the token and activation URL must never
  // be copied into a browser notification.
  console.error('[member-app/invitation] WhatsApp delivery failed:', sendResult.error ?? 'unknown error')
  return {
    success: false,
    message: `WhatsApp couldn't confirm delivery to ${memberData.name}. Check the member's WhatsApp number and try again.`,
    invitationCreated: true,
    whatsappSent: false,
  }
}

// ─── Row Actions ─────────────────────────────────────────────────────────────

export async function memberRowAction(
  action: MemberRowAction,
  memberId: string,
): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select('id')
    .eq('id', memberId)
    .eq('gym_id', gymId)
    .single()

  if (!member) return { success: false, message: 'Member not found in your gym' }

  switch (action) {
    case 'enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not enable portal access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal access enabled' }
    }

    case 'disable_portal': {
      // Delete all portal data: activity logs, auth user, and reset member portal columns
      const serviceUrl = process.env.SUPABASE_URL
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

      // Fetch member's auth_user_id before wiping
      const { data: memberForDelete } = await supabase
        .from('members')
        .select('auth_user_id')
        .eq('id', memberId)
        .eq('gym_id', gymId)
        .single()

      // Delete portal activity logs for this member
      await supabase
        .from('member_portal_activity')
        .delete()
        .eq('member_id', memberId)
        .eq('gym_id', gymId)

      // Delete the Supabase Auth user if exists
      if (memberForDelete?.auth_user_id && serviceUrl && serviceKey) {
        const { createClient: createServiceClient } = await import('@supabase/supabase-js')
        const serviceSupabase = createServiceClient(serviceUrl, serviceKey)
        await serviceSupabase.auth.admin.deleteUser(memberForDelete.auth_user_id)
      }

      // Reset all portal columns on the member row
      const { error } = await supabase.from('members')
        .update({
          portal_enabled: false,
          portal_suspended: false,
          invitation_status: 'not_sent',
          invitation_sent_at: null,
          portal_activated_at: null,
          last_portal_login: null,
          auth_user_id: null,
        })
        .eq('id', memberId)

      if (error) return { success: false, message: 'Could not disable portal. Please try again.' }
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Portal disabled and all member app data removed' }
    }

    case 'send_invitation':
    case 'resend_invitation': {
      const result = await issueInvitation(gymId, memberId)
      // The member row/token may have changed even when Meta did not confirm
      // delivery, so refresh cached UI state for both outcomes.
      await invalidateMemberAppCache(gymId)
      if (!result.success) return result

      // NOTE: 'invitation_sent' would be the accurate value for a first send,
      // but the member_portal_activity CHECK constraint only permits
      // 'invitation_resent'. Using anything else fails the INSERT at runtime, so
      // both cases log the allowed value until a migration extends the enum.
      await logActivity(gymId, memberId, 'invitation_resent')
      return result
    }

    case 'suspend_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not suspend access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_disabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member access suspended' }
    }

    case 'reactivate_access': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: false })
        .eq('id', memberId)
      if (error) return { success: false, message: 'Could not reactivate access. Please try again.' }
      await logActivity(gymId, memberId, 'portal_enabled')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member access reactivated' }
    }

    case 'reset_password': {
      await logActivity(gymId, memberId, 'password_reset')
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Password reset link sent' }
    }

    case 'force_logout': {
      await invalidateMemberAppCache(gymId)
      return { success: true, message: 'Member signed out of all devices' }
    }

    default:
      return { success: false, message: 'Unknown action' }
  }
}

// ─── Bulk Actions ────────────────────────────────────────────────────────────

export async function memberBulkAction(
  action: MemberBulkAction,
  memberIds: string[],
): Promise<ActionResult> {
  const gymId = await getOwnerGymId()
  if (!gymId) return { success: false, message: 'Unauthorized' }
  if (memberIds.length === 0) return { success: false, message: 'No members selected' }

  const supabase = await createClient()
  const count = memberIds.length

  const { count: verified } = await supabase
    .from('members')
    .select('id', { count: 'exact', head: true })
    .eq('gym_id', gymId)
    .in('id', memberIds)

  if ((verified ?? 0) !== count) {
    return { success: false, message: 'One or more members not found in your gym' }
  }

  switch (action) {
    case 'bulk_enable_portal': {
      const { error } = await supabase.from('members')
        .update({ portal_enabled: true, portal_suspended: false })
        .in('id', memberIds)
      if (error) return { success: false, message: 'Could not enable portal for selected members. Please try again.' }
      const activities = memberIds.map(id => ({
        gym_id: gymId, member_id: id, activity: 'portal_enabled' as const, performed_by: 'owner',
      }))
      await supabase.from('member_portal_activity').insert(activities)
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `Portal enabled for ${count} member${count === 1 ? '' : 's'}` }
    }

    case 'bulk_send_invitation': {
      // This used to only flip invitation_status to 'pending' — no token was
      // minted and no WhatsApp message was sent, so the table reported members
      // as invited when no invitation existed. It now runs the real invitation
      // for each member and reports per-member outcomes.
      const results = await Promise.all(
        memberIds.map(async (id) => ({ id, result: await issueInvitation(gymId, id) })),
      )

      const delivered = results.filter((entry) => entry.result.whatsappSent === true)
      const notDelivered = results.filter((entry) => entry.result.whatsappSent !== true)
      const invitationCreated = results.filter((entry) => entry.result.invitationCreated === true)

      if (delivered.length > 0) {
        // See the note in memberRowAction: the CHECK constraint only allows
        // 'invitation_resent' for invitation events.
        await supabase.from('member_portal_activity').insert(
          delivered.map(({ id }) => ({
            gym_id: gymId,
            member_id: id,
            activity: 'invitation_resent' as const,
            performed_by: 'owner',
          })),
        )
      }
      await invalidateMemberAppCache(gymId)

      if (notDelivered.length === 0) {
        return {
          success: true,
          message: `Invitation sent to ${delivered.length} member${delivered.length === 1 ? '' : 's'}`,
          invitationCreated: invitationCreated.length > 0,
          whatsappSent: true,
        }
      }
      if (delivered.length === 0) {
        return {
          success: false,
          message: invitationCreated.length > 0
            ? `WhatsApp couldn't confirm delivery for the selected member${count === 1 ? '' : 's'}. Check their numbers and try again.`
            : `No invitations were created. ${notDelivered[0].result.message}`,
          invitationCreated: invitationCreated.length > 0,
          whatsappSent: false,
        }
      }
      return {
        success: true,
        message: `WhatsApp delivered ${delivered.length} of ${count} invitations. Check the ${notDelivered.length} member number${notDelivered.length === 1 ? '' : 's'} and try again.`,
        invitationCreated: invitationCreated.length > 0,
        whatsappSent: true,
      }
    }

    case 'bulk_suspend': {
      const { error } = await supabase.from('members')
        .update({ portal_suspended: true })
        .in('id', memberIds)
      if (error) return { success: false, message: 'Could not suspend selected members. Please try again.' }
      const activities = memberIds.map(id => ({
        gym_id: gymId, member_id: id, activity: 'portal_disabled' as const, performed_by: 'owner',
      }))
      await supabase.from('member_portal_activity').insert(activities)
      await invalidateMemberAppCache(gymId)
      return { success: true, message: `${count} member${count === 1 ? '' : 's'} suspended` }
    }

    case 'bulk_export':
      return { success: true, message: `Exported ${count} member${count === 1 ? '' : 's'}` }

    default:
      return { success: false, message: 'Unknown action' }
  }
}

// ─── Gamification ────────────────────────────────────────────────────────────

const gamificationLog = logger.child({ component: 'MEMBER_APP_GAMIFICATION' })

/**
 * Owner + gym for the gamification actions, through the DAL.
 *
 * `getAuthUser()` verifies the JWT signature locally (getClaims), and the gym
 * is looked up by that verified user id, so the gym id below is never something
 * the browser supplied. A signed-in MEMBER owns no gym and gets null here. RLS
 * on both tables is still the real boundary: every statement runs on the
 * cookie-session client.
 */
async function getOwnerGym(): Promise<{ gymId: string } | null> {
  const { user } = await getAuthUser()
  if (!user) return null
  const { gym } = await getGym(user.id)
  return gym ? { gymId: gym.id } : null
}

const SETTINGS_SAVE_FAILED = 'Could not save the settings. Please try again.'
const AWARD_FAILED = 'Could not mark the prize. Please try again.'
const UNDO_FAILED = 'Could not undo that award. Please try again.'

/**
 * Saves one card of the Gamification tab (or just the Leaderboards toggle).
 *
 * `patch` is untrusted: it is whatever the browser posted to the action
 * endpoint, so it is re-validated here with the same schema the forms use.
 * Only the fields present in the patch are written (see `patchToRow`).
 */
export async function updateGamificationSettings(patch: unknown): Promise<GamificationSettingsResult> {
  const owner = await getOwnerGym()
  if (!owner) return { success: false, message: 'Unauthorized' }

  const parsed = gamificationSettingsPatchSchema.safeParse(patch)
  if (!parsed.success) {
    // The forms show field-level messages before submitting; reaching this
    // means the client and server disagree, so one readable line is enough.
    const first = Object.values(fieldErrors(parsed.error))[0]
    return { success: false, message: first ? `Check the values and try again: ${first}` : SETTINGS_SAVE_FAILED }
  }

  const row = patchToRow(parsed.data)
  if (Object.keys(row).length === 0) return { success: false, message: 'Nothing to save.' }

  if (parsed.data.badgeRules !== undefined) {
    const problem = badgeRulesProblem(parsed.data.badgeRules)
    if (problem) return { success: false, message: problem }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gym_gamification_settings')
    // `updated_at` is set explicitly: the table's trigger only fires on UPDATE,
    // and the first save for a gym is an INSERT.
    .upsert({ gym_id: owner.gymId, ...row, updated_at: new Date().toISOString() }, { onConflict: 'gym_id' })
    .select(GAMIFICATION_SETTINGS_COLUMNS)
    .single()

  if (error || !data) {
    gamificationLog.error('settings save failed', { code: error?.code, detail: error?.message })
    return { success: false, message: SETTINGS_SAVE_FAILED }
  }

  await invalidateMemberAppCache(owner.gymId)
  return { success: true, message: 'Gamification settings saved', settings: normalizeSettings(data) }
}

const awardInputSchema = z.object({
  board: z.enum(PRIZE_BOARDS),
  memberId: z.string().uuid(),
})

/**
 * `gamification_awards` has TWO foreign keys to members, so the embed must name
 * the constraint or PostgREST answers PGRST201.
 */
const AWARD_COLUMNS =
  'id, member_id, board, period_label, prize, awarded_at, member:members!fk_gamification_awards_member_same_gym(name)'

/**
 * Records that the owner handed the configured prize to a board's current
 * leader.
 *
 * The browser only says WHICH board and WHICH member. Everything else is
 * resolved here: the prize text comes from the saved settings, the period label
 * from the server clock, and the member must be in first place on a fresh read
 * of the board. The page the owner tapped on can be a poll interval old, and a
 * prize must not be recorded for someone who has just been overtaken.
 */
export async function markGamificationPrizeAwarded(input: unknown): Promise<GamificationAwardResult> {
  const owner = await getOwnerGym()
  if (!owner) return { success: false, message: 'Unauthorized' }

  const parsed = awardInputSchema.safeParse(input)
  if (!parsed.success) return { success: false, message: AWARD_FAILED }
  const { board, memberId } = parsed.data

  const supabase = await createClient()

  const [settingsRes, boardRes] = await Promise.all([
    supabase
      .from('gym_gamification_settings')
      .select(GAMIFICATION_SETTINGS_COLUMNS)
      .eq('gym_id', owner.gymId)
      .maybeSingle(),
    // Ties share rank 1, so read a few rows rather than only the first.
    supabase.rpc('get_gym_leaderboard', leaderboardRpcArgs(board, 10)),
  ])

  if (settingsRes.error || boardRes.error) {
    gamificationLog.error('award precheck failed', {
      settings: settingsRes.error?.code,
      board: boardRes.error?.code,
    })
    return { success: false, message: AWARD_FAILED }
  }

  const prize = prizeFor(normalizeSettings(settingsRes.data), board)
  if (!prize) return { success: false, message: 'Add a prize in Achievement Config first.' }

  const isLeader = pickLeaders(mapLeaderboard(boardRes.data), 10).some(row => row.memberId === memberId)
  if (!isLeader) {
    return { success: false, message: 'The leader has changed. Check the board and try again.' }
  }

  const periodLabel = awardPeriodLabel(board)
  const { data, error } = await supabase
    .from('gamification_awards')
    .insert({ gym_id: owner.gymId, member_id: memberId, board, period_label: periodLabel, prize })
    .select(AWARD_COLUMNS)
    .single()

  if (error) {
    // 23505 = the unique key (gym, member, board, period): a double tap or a
    // second device already recorded it. That is the state the owner wanted.
    if (error.code === '23505') {
      const { data: existing } = await supabase
        .from('gamification_awards')
        .select(AWARD_COLUMNS)
        .eq('gym_id', owner.gymId)
        .eq('member_id', memberId)
        .eq('board', board)
        .eq('period_label', periodLabel)
        .maybeSingle()
      return {
        success: true,
        message: 'Prize already marked as awarded',
        award: mapAward(existing) ?? undefined,
      }
    }
    gamificationLog.error('award insert failed', { code: error.code, detail: error.message })
    return { success: false, message: AWARD_FAILED }
  }

  await invalidateMemberAppCache(owner.gymId)

  // Tell the winner on WhatsApp. Awaited (a serverless function can be frozen
  // the moment the action returns) but never allowed to fail the action: the
  // award row is the record, the message is a courtesy. It is a no-op until
  // `gym_prize_awarded` is approved in Meta and added to the enable-list, and it
  // honours the per-gym WhatsApp switch inside sendTemplate.
  try {
    const { sendPrizeAwardedMessage } = await import('@/lib/whatsapp/automation')
    await sendPrizeAwardedMessage({
      gymId: owner.gymId,
      memberId,
      prize,
      periodLabel: board === 'week' ? 'the last 7 days' : 'the last 30 days',
      board,
    })
  } catch (err) {
    gamificationLog.error('prize message failed', { detail: err instanceof Error ? err.message : String(err) })
  }

  const award = mapAward(data) ?? undefined
  return {
    success: true,
    message: award ? `Prize marked as awarded to ${award.memberName}` : 'Prize marked as awarded',
    award,
  }
}

/** Undo for a mis-tap: deletes one award row of the caller's own gym. */
export async function undoGamificationAward(awardId: unknown): Promise<ActionResult> {
  const owner = await getOwnerGym()
  if (!owner) return { success: false, message: 'Unauthorized' }

  const parsed = z.string().uuid().safeParse(awardId)
  if (!parsed.success) return { success: false, message: UNDO_FAILED }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('gamification_awards')
    .delete()
    .eq('id', parsed.data)
    // Belt and braces with RLS: an id from another gym matches no row.
    .eq('gym_id', owner.gymId)
    .select('id')

  if (error) {
    gamificationLog.error('award delete failed', { code: error.code, detail: error.message })
    return { success: false, message: UNDO_FAILED }
  }

  await invalidateMemberAppCache(owner.gymId)
  // Already gone (undone on another device) is the outcome that was asked for.
  return {
    success: true,
    message: data && data.length > 0 ? 'Award removed' : 'That award was already removed',
  }
}
