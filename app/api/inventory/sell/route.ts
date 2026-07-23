import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { invalidateInventoryCache, invalidateInventoryItemCache } from '@/app/inventory/actions'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, 'inventory_sell', ROUTE_LIMITS.DEFAULT)
    if (!allowed) {
      return NextResponse.json({ error: 'Too many requests' }, { status: 429 })
    }

    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    const body = await req.json()
    const { inventoryId, quantity, paymentMode, unitPrice: customUnitPrice } = body

    if (!inventoryId || !quantity || quantity < 1) {
      return NextResponse.json({ error: 'Invalid request: inventoryId and quantity (>0) required' }, { status: 400 })
    }

    const mode = ['cash', 'upi', 'card'].includes(paymentMode) ? paymentMode : 'cash'

    let finalUnitPrice: number | null = null
    if (customUnitPrice !== undefined && customUnitPrice !== null) {
      const price = Number(customUnitPrice)
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: 'unitPrice must be >= 0' }, { status: 400 })
      }
      finalUnitPrice = price
    }

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
        return NextResponse.json({ error: msg || 'Sale failed' }, { status: 500 })
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
      return NextResponse.json({ error: salesError.message }, { status: 500 })
    }

    const { error: stockError } = await supabase
      .from('inventory')
      .update({
        initial_stock: Math.max(0, product.initial_stock - quantity),
        updated_at: new Date().toISOString(),
      })
      .eq('id', inventoryId)

    if (stockError) {
      return NextResponse.json({ error: stockError.message }, { status: 500 })
    }

    await invalidateInventoryItemCache(gym.id, inventoryId)

    return NextResponse.json({
      success: true,
      sale: { product_name: product.product_name, quantity, total_price: totalPrice },
      remaining_stock: product.initial_stock - quantity,
    })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) || 'Internal error' }, { status: 500 })
  }
}
