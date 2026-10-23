/**
 * features/member-app/services/inviteAllService.ts
 *
 * Browser-side call for "Invite all". Kept apart from memberAppService.ts, which
 * is server-only (cookie Supabase client) and cannot be imported by a client
 * component.
 */

import { api, GymFlowAPIError } from '@/lib/api/client'
import type { ActionResult } from '@/types/member-app'

interface InviteAllData {
  queued: number
  skippedNoPhone: number
  alreadyActivated: number
  alreadyQueued: number
  estimatedMinutes: number
  dailyRecipientLimit?: number
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`
}

export async function inviteAllMembers(): Promise<ActionResult> {
  try {
    const res = await api.post<{ success: boolean; data?: InviteAllData; error?: { message?: string } }>(
      '/api/member-app/invite-all',
    )
    if (!res?.success || !res.data) {
      return { success: false, message: res?.error?.message ?? 'We could not queue the invitations. Please try again.' }
    }
    const d = res.data
    const parts: string[] = []
    if (d.queued > 0) {
      const days = Math.ceil(d.estimatedMinutes / 1440)
      const eta = d.estimatedMinutes >= 1440
        ? `About ${plural(days, 'day')} to finish: WhatsApp allows ${d.dailyRecipientLimit ?? 250} new customers per day.`
        : `About ${d.estimatedMinutes} minutes to finish.`
      parts.push(`${plural(d.queued, 'invitation')} queued. ${eta}`)
    } else {
      parts.push('No new invitations were queued.')
    }
    if (d.skippedNoPhone > 0) parts.push(`${d.skippedNoPhone} skipped, no phone number.`)
    if (d.alreadyQueued > 0) parts.push(`${d.alreadyQueued} already queued.`)
    return { success: true, message: parts.join(' '), invitationCreated: d.queued > 0 }
  } catch (err) {
    // GymFlowAPIError carries the server's message (e.g. WHATSAPP_DISABLED).
    if (err instanceof GymFlowAPIError) return { success: false, message: err.message }
    return { success: false, message: 'We could not queue the invitations. Please try again.' }
  }
}
