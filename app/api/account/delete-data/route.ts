import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * POST /api/account/delete-data
 * Deletes all member-related data for the gym but keeps the gym row and auth user.
 * Body: { gym_id: string }
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }

    let body: { gym_id?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const { gym_id } = body
    if (!gym_id) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'gym_id is required' } }, { status: 400 })
    }

    // Verify the gym belongs to this user
    const { data: gym, error: gymError } = await supabase
      .from('gyms')
      .select('id')
      .eq('id', gym_id)
      .eq('owner_id', user.id)
      .single()

    if (gymError || !gym) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Gym not found or access denied' } }, { status: 403 })
    }

    // Delete in dependency order: attendance → memberships → members → area_aliases
    const deletions = [
      supabase.from('attendance').delete().eq('gym_id', gym_id),
      supabase.from('memberships').delete().eq('gym_id', gym_id),
    ]

    const results = await Promise.all(deletions)
    for (const { error } of results) {
      if (error) {
        return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: error.message } }, { status: 500 })
      }
    }

    // Delete members after their related records are gone
    const { error: membersError } = await supabase.from('members').delete().eq('gym_id', gym_id)
    if (membersError) {
      return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: membersError.message } }, { status: 500 })
    }

    // Delete area aliases if the table exists
    await supabase.from('area_aliases').delete().eq('gym_id', gym_id)

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: { code: 'INTERNAL_ERROR', message: err.message } }, { status: 500 })
  }
}
