import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { format } from 'date-fns'

const MAX_IMPORT_ROWS = 500

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } }, { status: 401 })
    }

    const { allowed } = await checkRateLimit(user.id, '/api/import/confirm', 5)
    if (!allowed) {
      return NextResponse.json({ success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } }, { status: 429 })
    }

    let body: { rows: Record<string, unknown>[]; gym_id?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    const { rows } = body

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Rows are required' } }, { status: 400 })
    }
    if (rows.length > MAX_IMPORT_ROWS) {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: `Maximum ${MAX_IMPORT_ROWS} rows per import` } }, { status: 400 })
    }

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }

    // ── Step 1: get MAX member_number from DB ─────────────────────────────────
    const { data: maxRow, error: maxErr } = await supabase
      .from('members')
      .select('member_number')
      .eq('gym_id', gym.id)
      .order('member_number', { ascending: false })
      .limit(1)

    console.log('[IMPORT] gym_id      :', gym.id)
    console.log('[IMPORT] maxRow      :', JSON.stringify(maxRow), '| maxErr:', maxErr?.message ?? 'none')

    const maxExisting = maxRow?.[0]?.member_number
      ? parseInt(String(maxRow[0].member_number))
      : 0

    console.log('[IMPORT] maxExisting :', maxExisting, '→ nextId starts at', maxExisting + 1)

    // ── Step 2: assign sequential IDs above the current max ───────────────────
    let nextId = maxExisting + 1
    const usedInBatch = new Set<number>()

    function claimNext(): number {
      while (usedInBatch.has(nextId)) nextId++
      const id = nextId++
      usedInBatch.add(id)
      return id
    }

    // ── Step 3: build insert payload ─────────────────────────────────────────
    const insertRows = rows.map((r) => ({
      gym_id:           gym.id,
      name:             String(r.name  ?? '').trim().slice(0, 255),
      phone:            String(r.phone ?? '').replace(/\D/g, '').slice(0, 15),
      age:              parseInt(r.age as string) || null,
      gender:           ['male', 'female', 'other'].includes(r.gender as string) ? r.gender : null,
      area:             r.area ? String(r.area).slice(0, 100) : null,
      member_number:    claimNext(),
      legacy_member_id: r.legacy_member_id ? String(r.legacy_member_id).slice(0, 50) : null,
    }))

    const assignedIds = insertRows.map(r => r.member_number)
    console.log('[IMPORT] rows        :', insertRows.length)
    console.log('[IMPORT] ids assigned:', assignedIds.join(', '))
    console.log('[IMPORT] duplicates? :', assignedIds.length !== new Set(assignedIds).size)

    // ── Step 4: insert ────────────────────────────────────────────────────────
    const { data, error: insertErr } = await supabase
      .from('members')
      .insert(insertRows)
      .select('id')

    if (insertErr) {
      console.error('[IMPORT] INSERT FAILED:', insertErr.code, insertErr.message, insertErr.details)
      const mapped = mapSupabaseError(insertErr)
      return NextResponse.json(
        { success: false, error: { code: mapped.code, message: mapped.message } },
        { status: mapped.status },
      )
    }

    console.log('[IMPORT] inserted    :', data?.length ?? 0, 'rows')

    await Promise.all([
      deleteCache(cacheKeys.membersList(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd'))),
    ])

    return NextResponse.json({
      success: true,
      data: { imported_count: data?.length ?? 0 },
      meta: { duration_ms: Date.now() - startTime },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 },
    )
  }
}
