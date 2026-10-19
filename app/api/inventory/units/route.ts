import { NextRequest, NextResponse } from 'next/server'
import { withAuth, isValidUUID } from '@/lib/api/withAuth'
import { boundedText } from '@/app/api/_guard'
import { deleteCache } from '@/lib/cache'

export const dynamic = 'force-dynamic'

/**
 * POST /api/inventory/units
 *
 * Add a new inventory unit (barcode-tracked item).
 * Also increments the product's initial_stock.
 *
 * Body: { inventory_id, barcode }
 */
export const POST = withAuth('INVENTORY_UNITS_ADD', async (req: NextRequest, { supabase, gym, log }) => {
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

  if (!boundedText(barcode, 200)) {
    return NextResponse.json(
      { success: false, error: { code: 'BAD_REQUEST', message: 'barcode is required (max 200 characters)' } },
      { status: 400 }
    )
  }

  // Verify product belongs to this gym
  const { data: product } = await supabase
    .from('inventory')
    .select('gym_id, initial_stock')
    .eq('id', inventory_id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!product) {
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
      barcode: barcode!.trim(),
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
    log.error('Inventory unit insert failed', insertError)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not add the unit. Please try again.' } },
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

  // Stock changed: drop the Redis copies of the product and the list (10 min TTL).
  await Promise.all([
    deleteCache(`inventory-item:${inventory_id}`),
    deleteCache(`inventory:${gym.id}`),
  ])

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
export const PATCH = withAuth('INVENTORY_UNITS_UPDATE', async (req: NextRequest, { supabase, gym, log }) => {
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
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!product) {
    return NextResponse.json(
      { success: false, error: { code: 'FORBIDDEN', message: 'Product does not belong to your gym' } },
      { status: 403 }
    )
  }

  // The unit must belong to this gym AND this product, otherwise a unit id
  // from another gym (or another product) could be flipped through here.
  const { data: unit } = await supabase
    .from('inventory_units')
    .select('id, status')
    .eq('id', unit_id)
    .eq('inventory_id', inventory_id)
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (!unit) {
    return NextResponse.json(
      { success: false, error: { code: 'NOT_FOUND', message: 'Unit not found for this product' } },
      { status: 404 }
    )
  }

  // Re-sending the same status must not move stock again (a double tap on
  // "sold" used to subtract twice).
  if (unit.status === status) {
    return NextResponse.json(
      { success: true, data: { unit_id, status } },
      { headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  // Conditional on the status we read, so concurrent requests change it once.
  const { data: changed, error: updateError } = await supabase
    .from('inventory_units')
    .update({ status })
    .eq('id', unit_id)
    .eq('gym_id', gym.id)
    .eq('status', unit.status)
    .select('id')

  if (updateError) {
    log.error('Inventory unit update failed', updateError)
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not update the unit. Please try again.' } },
      { status: 500 }
    )
  }
  if (!changed || changed.length === 0) {
    return NextResponse.json(
      { success: false, error: { code: 'CONFLICT', message: 'The unit changed. Reload and try again.' } },
      { status: 409 }
    )
  }

  // Same rule as before (only a sale lowers stock), now applied once per
  // transition; un-selling a unit back to available puts it back in stock.
  const delta = status === 'sold' ? -1 : unit.status === 'sold' && status === 'available' ? 1 : 0
  if (delta !== 0) {
    const { error: rpcError } = await supabase.rpc('increment_inventory_stock', {
      p_inventory_id: inventory_id,
      amount: delta,
    })
    if (rpcError) {
      await supabase
        .from('inventory')
        .update({ initial_stock: Math.max(0, (product.initial_stock ?? 0) + delta) })
        .eq('id', inventory_id)
        .eq('gym_id', gym.id)
    }
  }

  if (delta !== 0) {
    await Promise.all([
      deleteCache(`inventory-item:${inventory_id}`),
      deleteCache(`inventory:${gym.id}`),
    ])
  }

  return NextResponse.json(
    { success: true, data: { unit_id, status } },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
