import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { invalidatePattern } from '@/lib/cache'

// POST /api/support — send a message to a gym owner
export async function POST(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { gym_id, subject, body, type = 'info' } = await req.json()

  if (!gym_id || !subject || !body) {
    return NextResponse.json({ error: 'gym_id, subject and body are required' }, { status: 400 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('admin_messages')
    .insert({ gym_id, subject, body, type, sent_by: 'super_admin' })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Invalidate cache for this gym's messages
  await invalidatePattern(`gym:${gym_id}:admin_messages`)

  return NextResponse.json({ ok: true, message: data })
}

// GET /api/support — get all messages with gym info
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('admin_messages')
    .select('*, gym:gym_id(name)')
    .order('created_at', { ascending: false })
    .limit(100)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
