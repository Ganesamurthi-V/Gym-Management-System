/**
 * GET /api/import/next-member-id
 *
 * Returns the next safe member_number to start assigning from for this gym,
 * plus the set of any explicitly-requested numbers that already exist in the DB,
 * plus any phones from the file that already exist in the DB.
 *
 * Called by the client-side import pipeline before ID assignment so it has
 * accurate DB state — the pipeline's own Supabase client is anon-keyed and
 * cannot read members due to RLS.
 *
 * Query params:
 *   requested  — comma-separated member_number integers the file wants to use
 *
 * Response:
 *   {
 *     next_id:         number    // start auto-assigning from here
 *     conflicts:       number[]  // subset of `requested` that already exist
 *   }
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) {
      return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    }

    // Parse query params
    const rawRequested = req.nextUrl.searchParams.get('requested') ?? ''
    const requestedNums = rawRequested
      .split(',')
      .map(s => parseInt(s.trim()))
      .filter(n => !isNaN(n) && n > 0)

    // Run both queries in parallel
    const [maxRes, conflictRes] = await Promise.all([
      // MAX member_number — single row, fast descending index scan
      supabase
        .from('members')
        .select('member_number')
        .eq('gym_id', gym.id)
        .order('member_number', { ascending: false })
        .limit(1),

      // Which of the requested numbers already exist
      requestedNums.length > 0
        ? supabase
            .from('members')
            .select('member_number')
            .eq('gym_id', gym.id)
            .in('member_number', requestedNums)
        : Promise.resolve({ data: [] as { member_number: number }[] }),
    ])

    const maxRow = (maxRes.data ?? [])[0]
    const maxExisting = maxRow?.member_number ? parseInt(String(maxRow.member_number)) : 0
    const nextId = maxExisting + 1

    const conflicts = ((conflictRes.data ?? []) as { member_number: number }[])
      .map(r => parseInt(String(r.member_number)))
      .filter(n => !isNaN(n))

    return NextResponse.json({ next_id: nextId, conflicts })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unexpected error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
