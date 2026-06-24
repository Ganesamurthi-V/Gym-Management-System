import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function DELETE(req: Request, props: { params: Promise<{ id: string }> }) {
  try {
    const params = await props.params;
    const saleId = params.id;
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    // Fetch the sale to get quantity and inventory_id
    const { data: sale, error: fetchError } = await supabase
      .from('inventory_sales')
      .select('id, quantity, inventory_id')
      .eq('id', saleId)
      .eq('gym_id', gym.id)
      .single()

    if (fetchError || !sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    // Delete the sale
    const { error: deleteError } = await supabase
      .from('inventory_sales')
      .delete()
      .eq('id', saleId)
      .eq('gym_id', gym.id)

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 })
    }

    // Restore stock atomically to prevent race conditions
    if (sale.inventory_id) {
      await supabase.rpc('increment_inventory_stock', {
        p_inventory_id: sale.inventory_id,
        amount: sale.quantity
      })
    }

    return NextResponse.json({ success: true, restoredQuantity: sale.quantity })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
