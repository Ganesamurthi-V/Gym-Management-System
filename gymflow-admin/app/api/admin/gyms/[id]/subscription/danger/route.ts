import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { ADMIN_ACTOR, noteSchema, sanitizeUUID } from '@/lib/sanitize'
import { z } from 'zod'
import { setGymActive } from '@/lib/gym-active'

export const dynamic = 'force-dynamic'

/**
 * POST /api/admin/gyms/[id]/subscription/danger
 * Body: {
 *   action: 'delete_gym' | 'disable_login' | 'enable_login' | 'clear_subscription' | 'ban' | 'unban',
 *   performed_by?: string,
 *   notes?: string,
 *   confirm_gym_name?: string,  // required for delete_gym (the only irreversible action here)
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const id = sanitizeUUID((await props.params).id)
    if (!id) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const validActions = ['delete_gym', 'disable_login', 'enable_login', 'clear_subscription', 'ban', 'unban'] as const
    const parsed = z.object({ action: z.enum(validActions), notes: noteSchema, confirm_gym_name: z.string().max(200).optional() }).safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      return NextResponse.json({ error: `Invalid action. Must be one of: ${validActions.join(', ')}` }, { status: 400 })
    }
    const { action, notes, confirm_gym_name } = parsed.data
    const performed_by = ADMIN_ACTOR

    const supabase = createAdminClient()

    const { data: gym, error: fetchError } = await supabase
      .from('gyms')
      .select('name, subscription_status, plan_type, subscription_ends_at, trial_ends_at, is_active, owner_id')
      .eq('id', id)
      .single()
    if (fetchError) throw fetchError

    let actionLabel = ''
    let gymUpdate: Record<string, any> | null = null

    switch (action) {
      case 'delete_gym': {
        // Server-side confirmation: the browser/mobile dialog alone is bypassable by a direct API call.
        if (typeof confirm_gym_name !== 'string' || confirm_gym_name.trim() !== gym.name) {
          return NextResponse.json(
            { error: { code: 'CONFIRMATION_REQUIRED', message: 'confirm_gym_name must match the gym name' } },
            { status: 400 },
          )
        }
        const { error } = await supabase.from('gyms').delete().eq('id', id)
        if (error) throw error
        return NextResponse.json({ success: true, action: 'deleted' })
      }

      case 'disable_login': {
        gymUpdate = { is_active: false, login_disabled: true }
        actionLabel = 'Login Disabled (Admin Action)'
        break
      }

      case 'enable_login': {
        gymUpdate = { is_active: true, login_disabled: false }
        actionLabel = 'Login Re-enabled (Admin Action)'
        break
      }

      case 'clear_subscription': {
        gymUpdate = {
          subscription_status: 'trial',
          plan_type: 'trial',
          subscription_started_at: null,
          subscription_ends_at: null,
          trial_started_at: null,
          trial_ends_at: null,
          is_payment_verified: false,
          last_payment_status: 'none',
          last_transaction_id: null,
          last_payment_date: null,
          last_payment_amount: null,
        }
        actionLabel = 'Subscription Cleared'
        break
      }

      case 'ban': {
        gymUpdate = { is_active: false }
        actionLabel = 'Account Banned'
        break
      }

      case 'unban': {
        gymUpdate = { is_active: true }
        actionLabel = 'Account Unbanned'
        break
      }
    }

    if (gymUpdate) {
      if (['disable_login', 'enable_login', 'ban', 'unban'].includes(action)) {
        // These toggle access, so the owner's auth user must be banned/unbanned too (same as toggle-active);
        // otherwise a "banned" owner could still sign in.
        const { is_active, ...extra } = gymUpdate
        await setGymActive(supabase, id, is_active, extra)
      } else {
        const { error } = await supabase.from('gyms').update(gymUpdate).eq('id', id)
        if (error) throw error
      }

      await supabase.rpc('log_subscription_action', {
        p_gym_id: id,
        p_action: actionLabel,
        p_prev_status: gym.subscription_status,
        p_new_status: gymUpdate.subscription_status || gym.subscription_status,
        p_performed_by: performed_by,
        p_notes: notes || null,
      })
    }

    return NextResponse.json({ success: true, action })
  } catch (err: any) {
    console.error('[SubDanger]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
