import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireAdmin, adminServerError } from '@/lib/api/adminAuth'
import { isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

const ROUTE = 'PATCH /api/gyms/[id]/subscription'

const ALLOWED_STATUSES = ['trial', 'active', 'expired', 'cancelled', 'suspended']
const ALLOWED_PLANS = ['monthly', 'yearly', 'lifetime']
const DATE_RE = /^\d{4}-\d{2}-\d{2}([T ].*)?$/

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req, ROUTE)
  if (!auth.ok) return auth.response

  try {
    const params = await props.params

    if (!isValidUUID(params.id)) {
      return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    }

    let body: {
      subscription_status?: unknown
      plan_type?: unknown
      trial_ends_at?: unknown
      subscription_ends_at?: unknown
    }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }

    const { subscription_status, plan_type, trial_ends_at, subscription_ends_at } = body

    const supabase = createAdminClient()

    // Validate against allowlists so an admin token cannot write arbitrary
    // values into access-control columns.
    const updates: Record<string, string | null> = {}

    if (subscription_status !== undefined) {
      if (typeof subscription_status !== 'string' || !ALLOWED_STATUSES.includes(subscription_status)) {
        return NextResponse.json({ error: 'Invalid subscription_status' }, { status: 400 })
      }
      updates.subscription_status = subscription_status
    }

    if (plan_type !== undefined) {
      if (plan_type !== null && (typeof plan_type !== 'string' || !ALLOWED_PLANS.includes(plan_type))) {
        return NextResponse.json({ error: 'Invalid plan_type' }, { status: 400 })
      }
      updates.plan_type = (plan_type as string | null) || null
    }

    for (const [key, value] of [
      ['trial_ends_at', trial_ends_at],
      ['subscription_ends_at', subscription_ends_at],
    ] as const) {
      if (value === undefined) continue
      if (value === null || value === '') {
        updates[key] = null
        continue
      }
      if (typeof value !== 'string' || !DATE_RE.test(value) || isNaN(Date.parse(value))) {
        return NextResponse.json({ error: `Invalid ${key}` }, { status: 400 })
      }
      updates[key] = value
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { error } = await supabase
      .from('gyms')
      .update(updates)
      .eq('id', params.id)
      .select('owner_id')
      .single()

    if (error) throw error

    return NextResponse.json(
      { success: true },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    return adminServerError(ROUTE, err)
  }
}
