import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { logger } from '@/lib/logger'
import { maskIndianMobile } from '@/lib/auth/phone'

// Best effort on purpose: the marketing list must never block or change the result of signup,
// so every failure is logged (masked phone, no email) and swallowed.

export async function recordPhoneLead(args: {
  phoneE164: string
  email: string | null
  fullName: string | null
  userId: string
  /** null = the client did not say; the stored consent is left untouched. */
  consent: boolean | null
}): Promise<void> {
  try {
    const { error } = await createAdminClient().rpc('record_owner_phone_lead', {
      p_phone: args.phoneE164,
      p_email: args.email,
      p_full_name: args.fullName,
      p_user_id: args.userId,
      p_consent: args.consent,
    })
    if (error) logger.error('phone lead record failed', { phone: maskIndianMobile(args.phoneE164), reason: error.message })
  } catch (err) {
    logger.error('phone lead record threw', { phone: maskIndianMobile(args.phoneE164), reason: err instanceof Error ? err.message : 'unknown' })
  }
}
