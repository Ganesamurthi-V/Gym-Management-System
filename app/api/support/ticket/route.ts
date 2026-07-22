import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, 'support_ticket', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { subject, message, type } = await req.json()

    if (!subject || !message || !type) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Get the gym_id for this user
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) {
      return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    }

    // Insert the ticket
    const { error: insertError } = await supabase
      .from('support_tickets')
      .insert({
        gym_id: gym.id,
        subject,
        message,
        type,
        status: 'open'
      })

    if (insertError) throw insertError

    // Broadcast minimal notification to the admin clients
    try {
      await supabase.channel('admin_support_queue').send({
        type: 'broadcast',
        event: 'new_ticket',
        payload: { gym_id: gym.id, timestamp: new Date().toISOString() }
      })
    } catch (err) {
      console.warn('Failed to broadcast new_ticket event', err)
    }


    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to submit ticket' }, { status: 500 })
  }
}
