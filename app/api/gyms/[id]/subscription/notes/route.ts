import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function auth(req: NextRequest): boolean {
  const token = req.headers.get('authorization')?.split(' ')[1]
  return token === process.env.ADMIN_PASSWORD
}

/**
 * POST /api/gyms/[id]/subscription/notes
 * Body: {
 *   admin_notes?: string,
 *   is_vip?: boolean,
 *   is_payment_verified?: boolean,
 *   whatsapp_enabled?: boolean,
 *   priority_support?: boolean,
 *   auto_renewal_eligible?: boolean,
 *   lifetime_offer?: boolean,
 *   performed_by?: string,
 * }
 */
export async function POST(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  if (!auth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const { id } = await props.params
    const body = await req.json()
    const {
      admin_notes,
      is_vip,
      is_payment_verified,
      whatsapp_enabled,
      priority_support,
      auto_renewal_eligible,
      lifetime_offer,
      performed_by = 'admin',
    } = body

    const supabase = getAdminClient()
    const updates: Record<string, any> = {}

    if (admin_notes !== undefined) updates.admin_notes = admin_notes
    if (is_vip !== undefined) updates.is_vip = is_vip
    if (is_payment_verified !== undefined) updates.is_payment_verified = is_payment_verified
    if (whatsapp_enabled !== undefined) updates.whatsapp_enabled = whatsapp_enabled
    if (priority_support !== undefined) updates.priority_support = priority_support
    if (auto_renewal_eligible !== undefined) updates.auto_renewal_eligible = auto_renewal_eligible
    if (lifetime_offer !== undefined) updates.lifetime_offer = lifetime_offer

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', id)
    if (error) throw error

    // Log note changes only when notes are included
    if (admin_notes !== undefined) {
      await supabase.rpc('log_subscription_action', {
        p_gym_id: id,
        p_action: 'Admin Notes Updated',
        p_performed_by: performed_by,
        p_notes: admin_notes?.substring(0, 200) || '(cleared)',
      })
    }

    const flagsChanged = Object.keys(updates).filter(k => k !== 'admin_notes')
    if (flagsChanged.length > 0) {
      await supabase.rpc('log_subscription_action', {
        p_gym_id: id,
        p_action: 'Internal Flags Updated',
        p_performed_by: performed_by,
        p_notes: flagsChanged.map(f => `${f}: ${updates[f]}`).join(', '),
      })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
