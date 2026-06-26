import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { ticketId, clearAll } = await req.json()
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
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
