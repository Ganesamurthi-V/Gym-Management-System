import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { normalizePhoneForImport } from '@/lib/import/normalizers'
import { importConfirmSchema, MAX_CONFIRM_BODY_BYTES, MAX_IMPORT_ROWS } from '@/lib/import/schema'
import { apiLogger } from '@/lib/logger'
import { reportAlertInBackground } from '@/lib/monitoring/alert'
import { calcEndDate, todayIST } from '@/lib/utils'

const GENERIC_DB_MESSAGE = 'The import could not be saved. Please try again.'

// mapSupabaseError falls back to the raw database message; never send that to the browser.
function safeMapped(err: { code: string; message: string }) {
  const mapped = mapSupabaseError(err)
  return mapped.code === 'DATABASE_ERROR' ? { ...mapped, message: GENERIC_DB_MESSAGE } : mapped
}

// Two bulk inserts plus cache invalidation for up to 500 members. Without this the
// host's default limit (10 s on some plans) cut larger imports off mid-request and
// answered with an HTML error page instead of JSON.
export const maxDuration = 60

export async function POST(req: NextRequest) {
  const startTime = Date.now()
  const log = apiLogger('import_confirm')
  // Set once the gym is resolved so failure alerts can name it (no member data is ever included).
  let alertGymId: string | undefined
  const alertFailure = (step: string) => reportAlertInBackground({
    key: 'import:confirm_failed', severity: 'critical', title: 'Member import failed',
    body: `gymId=${alertGymId ?? 'unknown'} step=${step}`, gymId: alertGymId ?? null,
  })
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

    // Read as text first so an oversized body is refused before JSON.parse allocates it.
    let raw: string
    try { raw = await req.text() } catch {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid request' } }, { status: 400 })
    }
    if (raw.length > MAX_CONFIRM_BODY_BYTES) {
      return NextResponse.json({ success: false, error: { code: 'PAYLOAD_TOO_LARGE', message: `Maximum ${MAX_IMPORT_ROWS} rows per import` } }, { status: 413 })
    }
    let json: unknown
    try { json = JSON.parse(raw) } catch {
      return NextResponse.json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } }, { status: 400 })
    }

    // Unknown keys, including any `gym_id`, are dropped by the schema; the gym below
    // always comes from the session.
    const parsedBody = importConfirmSchema.safeParse(json)
    if (!parsedBody.success) {
      const issue = parsedBody.error.issues[0]
      const where = issue?.path.length ? ` (${issue.path.join('.')})` : ''
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: `${issue?.message ?? 'Invalid import data'}${where}` } },
        { status: 400 },
      )
    }
    const rows = parsedBody.data.rows

    const gym = await getGymForUser(supabase, user.id)
    alertGymId = gym?.id
    if (!gym) {
      return NextResponse.json({ success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } }, { status: 404 })
    }

    // ── Step 1: current MAX member_number and which requested numbers are taken ──
    const requested = [...new Set(rows.map(r => r.member_number).filter((n): n is number => n !== undefined))]
    const [maxRes, takenRes] = await Promise.all([
      supabase.from('members').select('member_number').eq('gym_id', gym.id)
        .order('member_number', { ascending: false }).limit(1),
      requested.length > 0
        ? supabase.from('members').select('member_number').eq('gym_id', gym.id).in('member_number', requested)
        : Promise.resolve({ data: [] as { member_number: number }[], error: null }),
    ])
    if (maxRes.error || takenRes.error) {
      log.error('import number lookup failed', maxRes.error ?? takenRes.error)
      alertFailure('number_lookup')
      return NextResponse.json({ success: false, error: { code: 'DATABASE_ERROR', message: GENERIC_DB_MESSAGE } }, { status: 500 })
    }
    const maxExisting = parseInt(String(maxRes.data?.[0]?.member_number ?? '0')) || 0
    const takenInDb = new Set((takenRes.data ?? []).map(r => Number(r.member_number)))

    // ── Step 2: assign numbers. A number the file asks for is only a request: it is
    //    honoured when free in the DB and unused earlier in this batch, otherwise the
    //    row gets the next number above everything in use. Nothing the browser
    //    computed is trusted as final. ────────────────────────────────────────────
    const usedInBatch = new Set<number>()
    const assigned: (number | null)[] = rows.map(r => {
      const n = r.member_number
      if (n !== undefined && !takenInDb.has(n) && !usedInBatch.has(n)) { usedInBatch.add(n); return n }
      return null
    })
    let nextId = maxExisting + 1
    for (let i = 0; i < assigned.length; i++) {
      if (assigned[i] !== null) continue
      while (usedInBatch.has(nextId) || takenInDb.has(nextId)) nextId++
      assigned[i] = nextId
      usedInBatch.add(nextId++)
    }

    // ── Step 3: build insert payload (values already validated and capped) ───────
    const insertRows = rows.map((r, i) => ({
      gym_id:           gym.id,
      name:             r.name,
      phone:            normalizePhoneForImport(r.phone).phone,
      age:              r.age ?? null,
      gender:           r.gender ?? null,
      date_of_birth:    r.date_of_birth ?? null,
      area:             r.area || null,
      member_number:    assigned[i] as number,
      legacy_member_id: r.legacy_member_id || null,
      is_imported:      true,
    }))

    // ── Step 4: insert ────────────────────────────────────────────────────────
    const { data, error: insertErr } = await supabase
      .from('members')
      .insert(insertRows)
      .select('id')

    if (insertErr) {
      log.error('member insert failed', insertErr)
      alertFailure('member_insert')
      const mapped = safeMapped(insertErr)
      return NextResponse.json(
        { success: false, error: { code: mapped.code, message: mapped.message } },
        { status: mapped.status },
      )
    }

    const memberIds = (data ?? []).map(d => d.id)

    // ── Step 5: insert the matching memberships ───────────────────────────────
    // Previously the browser did this with `supabase.from('memberships').insert()`
    // and supplied gym_id itself. Doing it here keeps gym_id server-derived and
    // removes the last direct database write from the import UI. Rows and
    // memberIds are index-aligned because the insert above preserves input order.
    const membershipRows = memberIds.map((memberId, i) => {
      const r = rows[i]
      const plan = r.plan
      const start = r.start_date ?? todayIST()

      return {
        member_id: memberId,
        gym_id: gym.id,
        plan,
        category: r.category,
        start_date: start,
        end_date: calcEndDate(start, plan),
        // The import brings in member and plan details only. A payment taken before joining
        // GymFlow is not a collection, so no amount is recorded (it would feed Payments, the
        // dashboard and reports). The file's amount/payment mode are intentionally not stored.
        amount: 0,
        payment_mode: 'cash',
        created_at: `${start}T00:00:00Z`,
      }
    })

    if (membershipRows.length > 0) {
      const { error: membershipErr } = await supabase.from('memberships').insert(membershipRows)
      if (membershipErr) {
        // The members are already committed. Report the partial state clearly
        // rather than implying the whole import failed.
        log.error('membership insert failed', membershipErr)
        alertFailure('membership_insert')
        const mapped = safeMapped(membershipErr)
        return NextResponse.json(
          {
            success: false,
            error: {
              code: 'MEMBERSHIPS_FAILED',
              message: `Imported ${memberIds.length} members, but their memberships could not be created (${mapped.message}).`,
            },
            data: { imported_count: memberIds.length, member_ids: memberIds, memberships_created: false },
          },
          { status: mapped.status },
        )
      }
    }

    await Promise.all([
      deleteCache(cacheKeys.paymentsAll(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, todayIST())),
    ])

    return NextResponse.json({
      success: true,
      data: {
        imported_count: memberIds.length,
        member_ids: memberIds,
        memberships_created: membershipRows.length,
      },
      meta: { duration_ms: Date.now() - startTime },
    })
  } catch (err: unknown) {
    log.error('import confirm failed', err)
    alertFailure('unknown')
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 },
    )
  }
}
