import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { invalidatePattern } from '@/lib/cache'

export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()
    
    // Fetch tickets with gym details
    const { data: tickets, error } = await supabase
      .from('support_tickets')
      .select('*, gyms(name, owner_id)')
      .eq('is_cleared_by_admin', false)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json(tickets)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { ticketId, status, replySubject, replyMessage } = await req.json()
    if (!ticketId || !status) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // First, fetch the ticket to get the gym_id
    const { data: ticket, error: fetchErr } = await supabase
      .from('support_tickets')
      .select('gym_id')
      .eq('id', ticketId)
      .single()
      
    if (fetchErr || !ticket) throw new Error('Ticket not found')

    const { error } = await supabase
      .from('support_tickets')
      .update({ 
        status, 
        resolved_at: status === 'resolved' ? new Date().toISOString() : null 
      })
      .eq('id', ticketId)

    if (error) throw error
    
    // Invalidate the cache for this gym's tickets since status updated
    await invalidatePattern(`gym:${ticket.gym_id}:support_tickets`)

    // If resolving and we have a reply message, send it to the gym
    if (status === 'resolved' && replySubject && replyMessage) {
      const { error: msgError } = await supabase
        .from('admin_messages')
        .insert({
          gym_id: ticket.gym_id,
          subject: replySubject,
          body: replyMessage,
          type: 'success'
        })
        
      if (msgError) throw msgError
      
      // Invalidate the cache for this gym's admin messages
      await invalidatePattern(`gym:${ticket.gym_id}:admin_messages`)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
