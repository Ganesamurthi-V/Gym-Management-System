import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

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

    // Fetch product to get current price and stock
    const { data: product, error: productError } = await supabase
      .from('inventory')
      .select('*')
      .eq('id', inventoryId)
      .eq('gym_id', gym.id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    if (product.initial_stock < quantity) {
      return NextResponse.json({ error: `Insufficient stock. Available: ${product.initial_stock}` }, { status: 400 })
    }

    if (customUnitPrice !== undefined && customUnitPrice !== null) {
      const price = Number(customUnitPrice)
      if (isNaN(price) || price < 0) {
        return NextResponse.json({ error: 'unitPrice must be >= 0' }, { status: 400 })
      }
    }

    const finalUnitPrice = customUnitPrice !== undefined && customUnitPrice !== null 
      ? Number(customUnitPrice) 
      : Number(product.selling_price)
      
    const totalPrice = finalUnitPrice * quantity

    // Insert sales record
    const { error: salesError } = await supabase
      .from('inventory_sales')
      .insert({
        gym_id: gym.id,
        inventory_id: inventoryId,
        product_name: product.product_name,
        variant_name: product.variant_name,
        quantity,
        unit_price: finalUnitPrice,
        total_price: totalPrice,
        payment_mode: mode,
      })

    if (salesError) {
      return NextResponse.json({ error: salesError.message }, { status: 500 })
    }

    // Decrement stock
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

    return NextResponse.json({
      success: true,
      sale: { product_name: product.product_name, quantity, total_price: totalPrice },
      remaining_stock: product.initial_stock - quantity,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
