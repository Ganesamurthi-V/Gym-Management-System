import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

export async function POST(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { gymId, isActive } = await req.json()
    
    if (!gymId || typeof isActive !== 'boolean') {
      return NextResponse.json({ error: 'Missing or invalid parameters' }, { status: 400 })
    }

    const supabase = createAdminClient()
    
    // Get the owner ID
    const { data: gym, error: gymErr } = await supabase.from('gyms').select('owner_id').eq('id', gymId).single()
    if (gymErr || !gym) throw new Error('Gym not found')

    // Update gym active status
    const { error: updateErr } = await supabase.from('gyms').update({ is_active: isActive }).eq('id', gymId)
    if (updateErr) throw updateErr

    // Update the user ban status
    // ban_duration: '876000h' logs out all sessions and prevents login (100 years). 'none' removes it.
    const { error: banErr } = await supabase.auth.admin.updateUserById(gym.owner_id, {
      ban_duration: isActive ? 'none' : '876000h'
    })

    if (banErr) throw banErr

    return NextResponse.json({ success: true, isActive })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
