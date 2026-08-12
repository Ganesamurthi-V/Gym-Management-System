import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * POST /api/inventory/units
 *
 * Add a new inventory unit (barcode-tracked item).
 * Also increments the product's initial_stock.
 *
 * Body: { inventory_id, barcode }
 */
export const POST = withAuth('INVENTORY_UNITS_ADD', async (req: NextRequest, { supabase, gym }) => {
  let body: { inventory_id?: string; barcode?: string }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { inventory_id, barcode } = body

  if (!inventory_id || !isValidUUID(inventory_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid inventory_id is required' } },
      { status: 400 }
    )
  }

  if (!barcode || typeof barcode !== 'string' || barcode.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'barcode is required' } },
      { status: 400 }
    )
  }

  // Verify product belongs to this gym
  const { data: product } = await supabase
    .from('inventory')
    .select('gym_id, initial_stock')
    .eq('id', inventory_id)
    .single()

  if (!product || product.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Product does not belong to your gym' } },
      { status: 403 }
    )
  }

  // Insert new unit
  const { data: newUnit, error: insertError } = await supabase
    .from('inventory_units')
    .insert({
      gym_id: gym.id,
      inventory_id,
      barcode: barcode.trim(),
      status: 'available',
    })
    .select()
    .single()

  if (insertError) {
    if (insertError.code === '23505') {
      return NextResponse.json(
        { success: false, error: { code: 'CONFLICT', message: 'This barcode is already registered in the system' } },
        { status: 409 }
      )
    }
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: insertError.message } },
      { status: 500 }
    )
  }

  // Increment stock count
  const { error: rpcError } = await supabase.rpc('increment_inventory_stock', {
    p_inventory_id: inventory_id,
    amount: 1,
  })
  if (rpcError) {
    // Fallback if RPC doesn't exist
    await supabase
      .from('inventory')
      .update({ initial_stock: (product.initial_stock ?? 0) + 1 })
      .eq('id', inventory_id)
  }

  return NextResponse.json(
    { success: true, data: newUnit },
    { status: 201, headers: { 'Cache-Control': 'private, no-store' } }
  )
})

/**
 * PATCH /api/inventory/units
 *
 * Update a unit's status (e.g., mark as sold).
 * Also decrements the product's initial_stock when selling.
 *
 * Body: { unit_id, status, inventory_id }
 */
export const PATCH = withAuth('INVENTORY_UNITS_UPDATE', async (req: NextRequest, { supabase, gym }) => {
  let body: { unit_id?: string; status?: string; inventory_id?: string }
  try { body = await req.json() } catch {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Invalid JSON' } },
      { status: 400 }
    )
  }

  const { unit_id, status, inventory_id } = body

  if (!unit_id || !isValidUUID(unit_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid unit_id is required' } },
      { status: 400 }
    )
  }

  if (!status || !['sold', 'available', 'damaged'].includes(status)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'status must be sold, available, or damaged' } },
      { status: 400 }
    )
  }

  if (!inventory_id || !isValidUUID(inventory_id)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'Valid inventory_id is required' } },
      { status: 400 }
    )
  }

  // Verify product belongs to this gym
  const { data: product } = await supabase
    .from('inventory')
    .select('gym_id, initial_stock')
    .eq('id', inventory_id)
    .single()

  if (!product || product.gym_id !== gym.id) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Product does not belong to your gym' } },
      { status: 403 }
    )
  }

  // Update unit status
  const { error: updateError } = await supabase
    .from('inventory_units')
    .update({ status })
    .eq('id', unit_id)

  if (updateError) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: updateError.message } },
      { status: 500 }
    )
  }

  // Adjust stock count when selling
  if (status === 'sold') {
    const { error: rpcError } = await supabase.rpc('increment_inventory_stock', {
      p_inventory_id: inventory_id,
      amount: -1,
    })
    if (rpcError) {
      await supabase
        .from('inventory')
        .update({ initial_stock: Math.max(0, (product.initial_stock ?? 0) - 1) })
        .eq('id', inventory_id)
    }
  }

  return NextResponse.json(
    { success: true, data: { unit_id, status } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
