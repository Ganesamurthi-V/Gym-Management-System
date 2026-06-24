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
    const { inventoryId } = body

    if (!inventoryId) {
      return NextResponse.json({ error: 'inventoryId is required' }, { status: 400 })
    }

    // Verify product belongs to this gym
    const { data: product, error: productError } = await supabase
      .from('inventory')
      .select('id')
      .eq('id', inventoryId)
      .eq('gym_id', gym.id)
      .single()

    if (productError || !product) {
      return NextResponse.json({ error: 'Product not found' }, { status: 404 })
    }

    // Delete inventory_units first (cascade should handle it, but be explicit)
    await supabase
      .from('inventory_units')
      .delete()
      .eq('inventory_id', inventoryId)

    // Delete the product itself
    const { error: deleteError } = await supabase
      .from('inventory')
      .delete()
      .eq('id', inventoryId)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    return NextResponse.json({ error: (err instanceof Error ? err.message : String(err)) || 'Internal error' }, { status: 500 })
  }
}
