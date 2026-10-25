import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { claimIdempotencyKey } from '@/lib/api/idempotency'
import { invalidateInventoryCache, invalidateInventoryItemCache } from '@/app/owner/inventory/actions'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { deleteCache } from '@/lib/cache'
import { passesCsrf, UUID_RE, boundedInt, boundedNumber, MAX_MONEY } from '@/app/api/_guard'
import { assertGymWritable } from '@/lib/subscriptionGuard'

export async function POST(req: NextRequest) {
  const log = apiLogger('INVENTORY_SELL')
  try {
    if (!passesCsrf(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, 'inventory_sell', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { data: gym } = await supabase
      .from('gyms')
      .select('id, is_active, subscription_status, plan_type, trial_ends_at, subscription_ends_at')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })
    const readOnly = assertGymWritable(gym)
    if (readOnly) return readOnly

    let body: Record<string, unknown>
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    if (typeof body !== 'object' || body === null || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
    }
    const { inventoryId, paymentMode, unitPrice: customUnitPrice } = body

    // Quantity must be a whole number: a fractional or huge value would
    // otherwise reach the stock arithmetic in the fallback path.
    const quantity = boundedInt(body.quantity, 1, 10_000)
    if (typeof inventoryId !== 'string' || !UUID_RE.test(inventoryId) || quantity === null) {
      return NextResponse.json({ error: 'Invalid request: inventoryId and a whole quantity (>0) required' }, { status: 400 })
    }

    const mode = typeof paymentMode === 'string' && ['cash', 'upi', 'card'].includes(paymentMode) ? paymentMode : 'cash'

    let finalUnitPrice: number | null = null
    if (customUnitPrice !== undefined && customUnitPrice !== null) {
      const price = boundedNumber(customUnitPrice, 0, MAX_MONEY)
      if (price === null) {
        return NextResponse.json({ error: 'unitPrice must be a number from 0 to 10000000' }, { status: 400 })
      }
      finalUnitPrice = price
    }

    // Double-tap guard: claimed only after validation so a 400 does not burn the key.
    const duplicate = await claimIdempotencyKey(req, gym.id, 'inventory-sell')
    if (duplicate) return duplicate

    // ── Fast path: atomic RPC (single round trip, oversell-safe) ────────────
    const { data: rpcData, error: rpcError } = await supabase.rpc('sell_inventory_item', {
      p_inventory_id: inventoryId,
      p_quantity:     quantity,
      p_unit_price:   finalUnitPrice,
      p_payment_mode: mode,
    })

    if (!rpcError && rpcData) {
      const result = rpcData as {
        product_name: string; quantity: number; total_price: number; remaining_stock: number
      }
      await invalidateInventoryItemCache(gym.id, inventoryId)
      await deleteCache(`gym:${gym.id}:payments_page:allTime`)
      return NextResponse.json({
        success: true,
        sale: { product_name: result.product_name, quantity: result.quantity, total_price: result.total_price },
        remaining_stock: result.remaining_stock,
      })
    }

    // Map the RPC's business exceptions to proper HTTP responses.
    if (rpcError) {
      const msg = rpcError.message ?? ''
      if (msg.includes('PRODUCT_NOT_FOUND')) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      if (msg.includes('ACCESS_DENIED')) {
        return NextResponse.json({ error: 'Product not found' }, { status: 404 })
      }
      if (msg.includes('INVALID_QUANTITY')) {
        return NextResponse.json({ error: 'Invalid quantity' }, { status: 400 })
      }
      const stockMatch = msg.match(/INSUFFICIENT_STOCK:(\d+)/)
      if (stockMatch) {
        return NextResponse.json({ error: `Insufficient stock. Available: ${stockMatch[1]}` }, { status: 400 })
      }
      // Only fall back to the legacy path if the RPC itself is missing
      // (migration not yet applied). Any other DB error is surfaced.
      const isMissingRpc = rpcError.code === 'PGRST202' || msg.toLowerCase().includes('could not find the function')
      if (!isMissingRpc) {
        log.error('sell_inventory_item failed', rpcError)
        return NextResponse.json({ error: 'Sale failed' }, { status: 500 })
      }
    }

    // ── Fallback path (RPC not deployed): original select → insert → update ──
    const { data: product, error: productError } = await supabase
      .from('inventory')
      .select('id, gym_id, product_name, variant_name, selling_price, initial_stock')
      .eq('id', inventoryId)
      .eq('gym_id', gym.id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (product.initial_stock < quantity) {
      return NextResponse.json({ error: `Insufficient stock. Available: ${product.initial_stock}` }, { status: 400 })
    }

    const fallbackUnitPrice = finalUnitPrice ?? Number(product.selling_price)
    const totalPrice = fallbackUnitPrice * quantity

    const { error: salesError } = await supabase
      .from('inventory_sales')
      .insert({
        gym_id: gym.id,
        inventory_id: inventoryId,
        product_name: product.product_name,
        variant_name: product.variant_name,
        quantity,
        unit_price: fallbackUnitPrice,
        total_price: totalPrice,
        payment_mode: mode,
      })

    if (salesError) {
      log.error('Sale insert failed', salesError)
      return NextResponse.json({ error: 'Sale failed' }, { status: 500 })
    }

    // Guarded on the stock we read so a concurrent sale cannot oversell.
    const { data: stockRows, error: stockError } = await supabase
      .from('inventory')
      .update({
        initial_stock: product.initial_stock - quantity,
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryId)
      .eq('gym_id', gym.id)
      .eq('initial_stock', product.initial_stock)
      .select('id')

    if (stockError || !stockRows || stockRows.length === 0) {
      log.error('Stock update failed after sale insert', stockError ?? { message: 'stock changed concurrently' })
      return NextResponse.json({ error: 'Stock changed while selling. Check the sales list and try again.' }, { status: 409 })
    }

    await invalidateInventoryItemCache(gym.id, inventoryId)
    // The payments page lists inventory sales and caches them for 5 minutes.
    await deleteCache(`gym:${gym.id}:payments_page:allTime`)

    return NextResponse.json({
      success: true,
      sale: { product_name: product.product_name, quantity, total_price: totalPrice },
      remaining_stock: product.initial_stock - quantity,
    })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/inventory/sell', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
