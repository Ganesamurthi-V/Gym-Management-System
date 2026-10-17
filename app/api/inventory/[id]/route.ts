import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { isValidUUID } from '@/lib/api/withAuth'
import { apiLogger } from '@/lib/logger'
import { passesCsrf, csrfRejected, boundedInt, boundedNumber, boundedText, MAX_MONEY, MAX_STOCK } from '@/app/api/_guard'

export const dynamic = 'force-dynamic'

/**
 * PATCH /api/inventory/[id]
 *
 * Update an inventory product's fields.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const log = apiLogger('INVENTORY_PATCH')
  try {
    if (!passesCsrf(req)) return csrfRejected()
    const { id } = await params
    if (!isValidUUID(id)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid inventory id' } },
        { status: 400 }
      )
    }

    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json(
        { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
        { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }

    const { allowed } = await checkRateLimit(user.id, '/api/inventory/[id]', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json(
        { success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
        { status: 429 }
      )
    }

    const gym = await getGymForUser(supabase, user.id)
    if (!gym) {
      return NextResponse.json(
        { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
        { status: 404 }
      )
    }

    // Verify product belongs to this gym
    const { data: product } = await supabase
      .from('inventory')
      .select('gym_id')
      .eq('id', id)
      .eq('gym_id', gym.id)
      .maybeSingle()

    if (!product) {
      return NextResponse.json(
        { success: false, error: { code: 'FORBIDDEN', message: 'Product does not belong to your gym' } },
        { status: 403 }
      )
    }

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
        { status: 400 }
      )
    }

    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid body' } },
        { status: 400 }
      )
    }

    // Explicit allowlist with type and range checks (no negative prices/stock).
    const bad = (message: string) => NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message } },
      { status: 400 }
    )
    const updates: Record<string, unknown> = {}
    const text = (key: string, max: number, required: boolean) => {
      if (body[key] === undefined) return true
      if (!required && (body[key] === null || body[key] === '')) { updates[key] = null; return true }
      const v = boundedText(body[key], max)
      if (v === null) return false
      updates[key] = v
      return true
    }
    if (!text('product_name', 120, true)) return bad('product_name must be 1-120 characters')
    if (!text('variant_name', 120, true)) return bad('variant_name must be 1-120 characters')
    if (!text('brand', 120, false)) return bad('brand is too long')
    if (!text('category', 120, false)) return bad('category is too long')
    if (!text('sku', 120, false)) return bad('sku is too long')
    if (!text('description', 2000, false)) return bad('description is too long')
    if (body.cost_price !== undefined) {
      const v = boundedNumber(body.cost_price, 0, MAX_MONEY)
      if (v === null) return bad('cost_price must be 0 or more')
      updates.cost_price = v
    }
    if (body.selling_price !== undefined) {
      const v = boundedNumber(body.selling_price, 0, MAX_MONEY)
      if (v === null) return bad('selling_price must be 0 or more')
      updates.selling_price = v
    }
    if (body.member_price !== undefined) {
      if (!body.member_price) updates.member_price = null
      else {
        const v = boundedNumber(body.member_price, 0, MAX_MONEY)
        if (v === null) return bad('member_price must be 0 or more')
        updates.member_price = v
      }
    }
    if (body.initial_stock !== undefined) {
      const v = boundedInt(body.initial_stock, 0, MAX_STOCK)
      if (v === null) return bad('initial_stock must be a whole number 0 or more')
      updates.initial_stock = v
    }
    if (body.low_stock_threshold !== undefined) {
      if (!body.low_stock_threshold) updates.low_stock_threshold = null
      else {
        const v = boundedInt(body.low_stock_threshold, 0, MAX_STOCK)
        if (v === null) return bad('low_stock_threshold must be a whole number 0 or more')
        updates.low_stock_threshold = v
      }
    }
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .eq('gym_id', gym.id)
      .select('id, product_name, variant_name, selling_price, initial_stock')
      .single()

    if (error) {
      log.error('Inventory update failed', error)
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not update the product. Please try again.' } },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    log.error('Unhandled exception in PATCH /api/inventory/[id]', err)
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
      { status: 500 }
    )
  }
}
