import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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

    // Use Service Role to bypass missing RLS UPDATE policies for these tables
    const serviceRoleClient = (await import('@supabase/supabase-js')).createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    if (clearAll) {
      console.log('CLEAR ALL REQUEST RECEIVED', { type, gymId: gym.id })
      if (type === 'admin_messages') {
        const { error, data } = await serviceRoleClient
          .from('admin_messages')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .not('read_at', 'is', null)
          .select()
        console.log('Admin messages clear result:', { error, updatedCount: data?.length })
        if (error) throw error
      } else if (type === 'support_tickets') {
        const { error, data } = await serviceRoleClient
          .from('support_tickets')
          .update({ is_cleared_by_owner: true })
          .eq('gym_id', gym.id)
          .eq('status', 'resolved')
          .select()
        console.log('Support tickets clear result:', { error, updatedCount: data?.length })
        if (error) throw error
      }
    } else if (id) {
      const { error } = await serviceRoleClient
        .from(type)
        .update({ is_cleared_by_owner: true })
        .eq('id', id)
        .eq('gym_id', gym.id)
      if (error) throw error
    }


    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
