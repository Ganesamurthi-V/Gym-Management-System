import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/inventory
 *
 * Create new inventory product(s). Accepts an array of variant rows.
 * Server determines gym_id from the authenticated user.
 */
export const POST = withAuth('INVENTORY_POST', async (req: NextRequest, { supabase, gym }) => {
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

  // Validate and build insert rows
  const rows = variants.map(v => ({
    gym_id: gym.id,
    product_name: v.product_name as string,
    brand: (v.brand as string) || null,
    category: (v.category as string) || null,
    description: (v.description as string) || null,
    variant_name: v.variant_name as string,
    sku: (v.sku as string) || null,
    cost_price: parseFloat(String(v.cost_price)),
    selling_price: parseFloat(String(v.selling_price)),
    member_price: v.member_price ? parseFloat(String(v.member_price)) : null,
    initial_stock: parseInt(String(v.initial_stock), 10),
    low_stock_threshold: v.low_stock_threshold ? parseInt(String(v.low_stock_threshold), 10) : null,
  }))

  // Basic validation
  for (const row of rows) {
    if (!row.product_name || !row.variant_name) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'product_name and variant_name are required' } },
        { status: 400 }
      )
    }
    if (isNaN(row.cost_price) || isNaN(row.selling_price) || isNaN(row.initial_stock)) {
      return NextResponse.json(
        { success: false, error: { code: 'BAD_REQUEST', message: 'cost_price, selling_price, and initial_stock must be valid numbers' } },
        { status: 400 }
      )
    }
  }

  const { data, error } = await supabase
    .from('inventory')
    .insert(rows)
    .select('id, product_name, variant_name')

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: error.message } },
      { status: 500 }
    )
  }

  return NextResponse.json(
    { success: true, data },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
})
