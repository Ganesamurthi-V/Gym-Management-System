import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { boundedInt, boundedNumber, boundedText, MAX_MONEY, MAX_STOCK } from '@/app/api/_guard'

export const dynamic = 'force-dynamic'

/**
 * POST /api/inventory
 *
 * Create new inventory product(s). Accepts an array of variant rows.
 * Server determines gym_id from the authenticated user.
 */
export const POST = withAuth('INVENTORY_POST', async (req: NextRequest, { supabase, gym, log }) => {
  let body: { variants?: Array<Record<string, unknown>> }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const variants = body.variants
  if (!Array.isArray(variants) || variants.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'variants array is required' } },
      { status: 400 }
    )
  }

  if (variants.length > 50) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Too many variants (max 50)' } },
      { status: 400 }
    )
  }

  // Explicit allowlist: every column is validated and bounded here, nothing is
  // spread from the request. Negative prices/stock would corrupt sales totals.
  const optionalText = (value: unknown, max: number): string | null | undefined =>
    value === undefined || value === null || value === '' ? null : (boundedText(value, max) ?? undefined)
  const rows = []
  for (const v of variants) {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Each variant must be an object' } },
        { status: 400 }
      )
    }
    const product_name = boundedText(v.product_name, 120)
    const variant_name = boundedText(v.variant_name, 120)
    if (!product_name || !variant_name) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'product_name and variant_name are required (max 120 characters)' } },
        { status: 400 }
      )
    }
    const cost_price = boundedNumber(v.cost_price, 0, MAX_MONEY)
    const selling_price = boundedNumber(v.selling_price, 0, MAX_MONEY)
    const initial_stock = boundedInt(v.initial_stock, 0, MAX_STOCK)
    if (cost_price === null || selling_price === null || initial_stock === null) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'cost_price and selling_price must be 0 or more, and initial_stock a whole number 0 or more' } },
        { status: 400 }
      )
    }
    const hasMember = v.member_price !== undefined && v.member_price !== null && v.member_price !== '' && v.member_price !== 0
    const member_price = hasMember ? boundedNumber(v.member_price, 0, MAX_MONEY) : null
    const hasThreshold = v.low_stock_threshold !== undefined && v.low_stock_threshold !== null && v.low_stock_threshold !== '' && v.low_stock_threshold !== 0
    const low_stock_threshold = hasThreshold ? boundedInt(v.low_stock_threshold, 0, MAX_STOCK) : null
    const brand = optionalText(v.brand, 120)
    const category = optionalText(v.category, 120)
    const description = optionalText(v.description, 2000)
    const sku = optionalText(v.sku, 120)
    if ((hasMember && member_price === null) || (hasThreshold && low_stock_threshold === null) ||
        brand === undefined || category === undefined || description === undefined || sku === undefined) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid member_price, low_stock_threshold or text field' } },
        { status: 400 }
      )
    }
    rows.push({
      gym_id: gym.id,
      product_name, brand, category, description, variant_name, sku,
      cost_price, selling_price, member_price, initial_stock, low_stock_threshold,
    })
  }

  const { data, error } = await supabase
    .from('inventory')
    .insert(rows)
    .select('id, product_name, variant_name')

  if (error) {
    log.error('Inventory insert failed', error)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not save the products. Please try again.' } },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, data },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
})
