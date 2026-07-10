import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

// PATCH /api/gyms/[gymId]/status — toggle gym active status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ gymId: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { gymId } = await params
  const body = await req.json().catch(() => ({}))
  const { is_active } = body

  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { error } = await supabase
    .from('gyms')
    .update({ is_active })
    .eq('id', gymId)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_active })
}
