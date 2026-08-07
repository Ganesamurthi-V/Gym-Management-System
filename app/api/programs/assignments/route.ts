/**
 * /api/programs/assignments
 *
 * GET  ?programId=<uuid>          → list assigned member IDs
 * POST { programId, memberIds, mode }  → assign members
 *   mode: 'specific' | 'all'
 *   memberIds: string[] (ignored when mode='all')
 * DELETE { programId, memberIds }  → unassign specific members
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getAuthUser, getGym } from '@/lib/dal'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ─── GET: list current assignments ───────────────────────────────────────────

export async function GET(req: NextRequest) {
  const programId = req.nextUrl.searchParams.get('programId')
  if (!programId || !UUID_RE.test(programId)) {
    return NextResponse.json({ error: 'Missing or invalid programId' }, { status: 400 })
  }

  const { user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { gym } = await getGym(user.id)
  if (!gym) return NextResponse.json({ error: 'No gym found' }, { status: 404 })

  const supabase = await createClient()

  const { data, error } = await supabase
    .from('program_assignments')
    .select('member_id')
    .eq('program_id', programId)
    .eq('gym_id', gym.id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    programId,
    memberIds: (data ?? []).map((r: { member_id: string }) => r.member_id),
  })
}

// ─── POST: assign members ────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  let body: { programId?: string; memberIds?: string[]; mode?: 'specific' | 'all' }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { programId, memberIds, mode } = body

  if (!programId || !UUID_RE.test(programId)) {
    return NextResponse.json({ error: 'Missing or invalid programId' }, { status: 400 })
  }
  if (mode !== 'all' && (!Array.isArray(memberIds) || memberIds.length === 0)) {
    return NextResponse.json({ error: 'memberIds required when mode is not "all"' }, { status: 400 })
  }

  const { user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { gym } = await getGym(user.id)
  if (!gym) return NextResponse.json({ error: 'No gym found' }, { status: 404 })

  const supabase = await createClient()

  // Verify the program belongs to this gym
  const { data: program } = await supabase
    .from('workout_programs')
    .select('id')
    .eq('id', programId)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!program) {
    return NextResponse.json({ error: 'Program not found in your gym' }, { status: 404 })
  }

  // Resolve target member IDs
  let targetIds: string[]

  if (mode === 'all') {
    const { data: allMembers, error: mErr } = await supabase
      .from('members')
      .select('id')
      .eq('gym_id', gym.id)

    if (mErr || !allMembers) {
      return NextResponse.json({ error: 'Failed to fetch members' }, { status: 500 })
    }
    targetIds = allMembers.map((m: { id: string }) => m.id)
  } else {
    // Verify all provided IDs belong to this gym
    const { data: verified, error: vErr } = await supabase
      .from('members')
      .select('id')
      .eq('gym_id', gym.id)
      .in('id', memberIds!)

    if (vErr) {
      return NextResponse.json({ error: 'Failed to verify members' }, { status: 500 })
    }
    targetIds = (verified ?? []).map((m: { id: string }) => m.id)

    if (targetIds.length === 0) {
      return NextResponse.json({ error: 'No valid members found' }, { status: 400 })
    }
  }

  // Upsert assignments (ON CONFLICT DO NOTHING via the unique constraint)
  const rows = targetIds.map((memberId) => ({
    gym_id: gym.id,
    program_id: programId,
    member_id: memberId,
    assigned_by: user.id,
  }))

  // Supabase JS doesn't support ON CONFLICT DO NOTHING directly with insert,
  // so we use upsert with ignoreDuplicates.
  const { error: insertErr } = await supabase
    .from('program_assignments')
    .upsert(rows, { onConflict: 'program_id,member_id', ignoreDuplicates: true })

  if (insertErr) {
    console.error('[programs/assignments] insert error:', insertErr.message)
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    assigned: targetIds.length,
    message: mode === 'all'
      ? `Program assigned to all ${targetIds.length} members`
      : `Program assigned to ${targetIds.length} member${targetIds.length === 1 ? '' : 's'}`,
  })
}

// ─── DELETE: unassign members ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  let body: { programId?: string; memberIds?: string[] }
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { programId, memberIds } = body

  if (!programId || !UUID_RE.test(programId)) {
    return NextResponse.json({ error: 'Missing or invalid programId' }, { status: 400 })
  }
  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return NextResponse.json({ error: 'memberIds required' }, { status: 400 })
  }

  const { user } = await getAuthUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { gym } = await getGym(user.id)
  if (!gym) return NextResponse.json({ error: 'No gym found' }, { status: 404 })

  const supabase = await createClient()

  const { error } = await supabase
    .from('program_assignments')
    .delete()
    .eq('program_id', programId)
    .eq('gym_id', gym.id)
    .in('member_id', memberIds)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({
    success: true,
    removed: memberIds.length,
    message: `${memberIds.length} member${memberIds.length === 1 ? '' : 's'} unassigned`,
  })
}
