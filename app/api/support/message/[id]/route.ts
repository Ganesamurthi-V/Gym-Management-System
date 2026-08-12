import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'
import { isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/support/message/[id]
 *
 * Returns a single admin message by ID (only if it belongs to user's gym).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid message id' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401 }
      )
    }

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
        { status: 404 }
      )
    }

    const { data, error } = await supabase
      .from('admin_messages')
      .select('id, subject, body')
      .eq('id', id)
      .eq('gym_id', gym.id)
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Message not found' } },
        { status: 404 }
      )
    }

    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    )
  }
}
