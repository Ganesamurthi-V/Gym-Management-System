import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { invalidatePattern } from '@/lib/cache'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()
    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    const { type, id, clearAll } = await req.json()
    if (!type || !['admin_messages', 'support_tickets'].includes(type)) {
      return NextResponse.json({ error: 'Invalid type' }, { status: 400 })
    }

    if (clearAll) {
      if (type === 'admin_messages') {
        await supabase
          .from('admin_messages')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .not('read_at', 'is', null)
      } else if (type === 'support_tickets') {
        await supabase
          .from('support_tickets')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .eq('status', 'resolved')
      }
    } else if (id) {
      await supabase
        .from(type)
        .update({ is_cleared_by_owner: true })
        .eq('id', id)
        .eq('gym_id', gym.id)
    }

    // Invalidate Cache
    await invalidatePattern(`gym:${gym.id}:${type}`)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
