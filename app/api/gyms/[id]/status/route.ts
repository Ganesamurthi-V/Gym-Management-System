import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'
import { isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

const ROUTE = 'PATCH /api/gyms/[id]/status'

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ROUTE)
  if (!auth.ok) return auth.response

  try {
    const params = await props.params

    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    }

    let body: { is_active?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { is_active } = body

    if (typeof is_active !== 'boolean') {
      return NextResponse.json({ error: 'Invalid is_active value' }, { status: 400 })
    }

    const supabase = createAdminClient()

    const { data, error } = await supabase
      .from('gyms')
      .update({ is_active })
      .eq('id', params.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(
      { success: true, gym: data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    return adminServerError(ROUTE, err)
  }
}
