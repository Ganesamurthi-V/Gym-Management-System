import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sanitizeUUID } from '@/lib/sanitize'
import { setGymActive } from '@/lib/gym-active'

// PATCH /api/gyms/[gymId]/status — toggle gym active status
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ gymId: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const gymId = sanitizeUUID((await params).gymId)
  if (!gymId) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
  const body = await req.json().catch(() => ({}))
  const { is_active } = body

  if (typeof is_active !== 'boolean') {
    return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
  }

  try {
    const found = await setGymActive(createAdminClient(), gymId, is_active)
    if (!found) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
  } catch (error) {
    console.error('[GymStatus]', error)
    return NextResponse.json({ error: 'Failed to update gym status' }, { status: 500 })
  }

  return NextResponse.json({ success: true, is_active })
}
