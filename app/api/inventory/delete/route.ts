import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { deleteCache } from '@/lib/cache'
import { passesCsrf, UUID_RE } from '@/app/api/_guard'
import { assertGymWritable } from '@/lib/subscriptionGuard'

export async function POST(req: NextRequest) {
  const log = apiLogger('INVENTORY_DELETE')
  try {
    if (!passesCsrf(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { allowed } = await checkRateLimit(user.id, 'inventory_delete', ROUTE_LIMITS.DEFAULT)
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

    let body: { inventoryId?: unknown }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
    }
    const inventoryId = body?.inventoryId

    if (typeof inventoryId !== 'string' || !UUID_RE.test(inventoryId)) {
      return NextResponse.json({ error: 'A valid inventoryId is required' }, { status: 400 })
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
    const { error: unitsError } = await supabase
      .from('inventory_units')
      .delete()
      .eq('inventory_id', inventoryId)
      .eq('gym_id', gym.id)

    if (unitsError) {
      log.error('Unit delete failed', unitsError)
      return NextResponse.json({ error: 'Could not delete the product' }, { status: 500 })
    }

    // Delete the product itself
    const { error: deleteError } = await supabase
      .from('inventory')
      .delete()
      .eq('id', inventoryId)
      .eq('gym_id', gym.id)

    if (deleteError) {
      log.error('Product delete failed', deleteError)
      return NextResponse.json({ error: 'Could not delete the product' }, { status: 500 })
    }

    // Drop the Redis copies (10 min TTL) so the deleted product disappears at once.
    await Promise.all([
      deleteCache(`inventory-item:${inventoryId}`),
      deleteCache(`inventory-sales:${inventoryId}`),
      deleteCache(`inventory:${gym.id}`),
    ])

    return NextResponse.json({ success: true })
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/inventory/delete', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
