import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { passesCsrf, UUID_RE } from '@/app/api/_guard'

export async function DELETE(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  const log = apiLogger('INVENTORY_SALE_DELETE')
  try {
    if (!passesCsrf(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const params = await props.params;
    const saleId = params.id;
    if (!UUID_RE.test(saleId)) return NextResponse.json({ error: 'Invalid sale id' }, { status: 400 })
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, 'inventory_sale_delete', ROUTE_LIMITS.DEFAULT)
    if (!allowed) return NextResponse.json({ error: 'Too many requests' }, { status: 429 })

    // Verify gym ownership
    const { data: gym } = await supabase
      .from('gyms')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

    // Delete the sale and read back what was removed in one statement, so two
    // simultaneous deletes cannot both see the row and restore the stock twice.
    const { data: deleted, error: deleteError } = await supabase
      .from('inventory_sales')
      .delete()
      .eq('id', saleId)
      .eq('gym_id', gym.id)
      .select('id, quantity, inventory_id')

    if (deleteError) {
      log.error('Sale delete failed', deleteError)
      return NextResponse.json({ error: 'Could not delete the sale' }, { status: 500 })
    }

    const sale = deleted?.[0]
    if (!sale) {
      return NextResponse.json({ error: 'Sale not found' }, { status: 404 })
    }

    // Restore stock atomically to prevent race conditions
    if (sale.inventory_id) {
      const { error: restoreError } = await supabase.rpc('increment_inventory_stock', {
        p_inventory_id: sale.inventory_id,
        amount: sale.quantity
      })
      if (restoreError) {
        // The sale is already gone; surface it so the owner can fix the count.
        log.error('Stock restore failed after sale delete', restoreError)
        return NextResponse.json(
          { error: 'Sale deleted but stock could not be restored. Please adjust the stock manually.' },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ success: true, restoredQuantity: sale.quantity })

  } catch (err: unknown) {
    log.error('Unhandled exception in DELETE /api/inventory/sales/[id]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
