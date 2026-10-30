import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { passesCsrf, UUID_RE } from '@/app/api/_guard'
import { recordOwnerAction } from '@/lib/activity/record'

export async function POST(req: NextRequest) {
  const log = apiLogger('SUPPORT_CLEAR')
  try {
    if (!passesCsrf(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, 'support_clear', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    let body: { type?: unknown; id?: unknown; clearAll?: unknown }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const { type, id, clearAll } = body ?? {}
    if (type !== 'admin_messages' && type !== 'support_tickets') {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }
    if (!clearAll && (typeof id !== 'string' || !UUID_RE.test(id))) {
      return NextResponse.json({ error: 'A valid id is required' }, { status: 400 })
    }

    if (clearAll) {
      if (type === 'admin_messages') {
        const { error, data } = await supabase
          .from('admin_messages')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .not('read_at', 'is', null)
          .select()
        if (error) throw error
      } else if (type === 'support_tickets') {
        const { error, data } = await supabase
          .from('support_tickets')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .eq('status', 'resolved')
          .select()
        if (error) throw error
      }
    } else if (id) {
      const { error } = await supabase
        .from(type)
        .update({ is_cleared_by_owner: true })
        .eq('id', id)
        .eq('gym_id', gym.id)
      if (error) throw error
    }


    recordOwnerAction(supabase, req, 'SUPPORT_CLEAR')
    return NextResponse.json({ success: true })
  } catch (error: unknown) {
    log.error('Unhandled exception in POST /api/support/clear', error)
    return NextResponse.json({ error: 'Could not clear. Please try again.' }, { status: 500 })
  }
}
