import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sanitizeUUID } from '@/lib/sanitize'

export async function POST(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json().catch(() => null) as { ticketId?: unknown; clearAll?: unknown } | null
    const clearAll = body?.clearAll === true
    const ticketId = typeof body?.ticketId === 'string' ? sanitizeUUID(body.ticketId) : null
    if (!clearAll && !ticketId) {
      return NextResponse.json({ error: 'Provide a valid ticketId or clearAll=true' }, { status: 400 })
    }
    const supabase = createAdminClient()

    if (clearAll) {
      const { error } = await supabase
        .from('support_tickets')
        .update({ is_cleared_by_admin: true })
        .eq('status', 'resolved')

      if (error) throw error
    } else if (ticketId) {
      const { error } = await supabase
        .from('support_tickets')
        .update({ is_cleared_by_admin: true })
        .eq('id', ticketId)

      if (error) throw error
    }


    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[TicketsClear]', error)
    return NextResponse.json({ error: 'Failed to clear tickets' }, { status: 500 })
  }
}
