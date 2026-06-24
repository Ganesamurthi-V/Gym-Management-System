import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/programs', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    const body = await req.json()
    const { 
      id, name, summary, notes, duration, frequency, 
      difficulty, goal, category, equipment, 
      targetAudience, experienceLevel, schedule, isDraft 
    } = body

    if (!name || !duration || !schedule) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const payload = {
        gym_id: gym.id,
        name,
        summary,
        notes,
        duration: parseInt(duration),
        frequency: parseInt(frequency) || null,
        difficulty,
        goal,
        category,
        equipment,
        target_audience: targetAudience,
        experience_level: experienceLevel,
        schedule,
        is_draft: isDraft || false,
        updated_at: new Date().toISOString()
    }

    let result;
    if (id) {
       result = await supabase.from('workout_programs').update(payload).eq('id', id).eq('gym_id', gym.id).select().single()
    } else {
       result = await supabase.from('workout_programs').insert(payload).select().single()
    }

    if (result.error) {
      console.error('Error saving program:', result.error)
      return NextResponse.json({ error: 'A database error occurred' }, { status: 500 })
    }

    return NextResponse.json({ success: true, program: result.data })
  } catch (err: any) {
    console.error('Internal API error:', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Missing program ID' }, { status: 400 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, '/api/programs', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ error: 'Rate limit exceeded' }, { status: 429 })

    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    const { error } = await supabase
      .from('workout_programs')
      .delete()
      .eq('id', id)
      .eq('gym_id', gym.id)

    if (error) {
      return NextResponse.json({ error: 'A database error occurred' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
