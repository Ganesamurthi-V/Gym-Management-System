import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { isValidUUID } from '@/lib/api/withAuth'

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
  try {
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
      .single()

    if (!product || product.gym_id !== gym.id) {
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

    const updates: Record<string, unknown> = {}
    if (body.product_name !== undefined) updates.product_name = body.product_name
    if (body.brand !== undefined) updates.brand = body.brand || null
    if (body.category !== undefined) updates.category = body.category || null
    if (body.sku !== undefined) updates.sku = body.sku || null
    if (body.description !== undefined) updates.description = body.description || null
    if (body.variant_name !== undefined) updates.variant_name = body.variant_name
    if (body.cost_price !== undefined) updates.cost_price = parseFloat(String(body.cost_price))
    if (body.selling_price !== undefined) updates.selling_price = parseFloat(String(body.selling_price))
    if (body.member_price !== undefined) updates.member_price = body.member_price ? parseFloat(String(body.member_price)) : null
    if (body.initial_stock !== undefined) updates.initial_stock = parseInt(String(body.initial_stock), 10)
    if (body.low_stock_threshold !== undefined) updates.low_stock_threshold = body.low_stock_threshold ? parseInt(String(body.low_stock_threshold), 10) : null
    updates.updated_at = new Date().toISOString()

    const { data, error } = await supabase
      .from('inventory')
      .update(updates)
      .eq('id', id)
      .select('id, product_name, variant_name, selling_price, initial_stock')
      .single()

    if (error) {
      return NextResponse.json(
        { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
        { status: 500 }
      )
    }

    return NextResponse.json(
      { success: true, data },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'An unexpected error occurred'
    return NextResponse.json(
      { success: false, error: { code: 'INTERNAL_ERROR', message } },
      { status: 500 }
    )
  }
}
