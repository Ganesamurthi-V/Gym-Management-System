import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/account/upi-config
 *
 * Returns the UPI configuration for the authenticated user's gym.
 */
export const GET = withAuth('ACCOUNT_UPI_CONFIG_GET', async (req: NextRequest, { supabase, gym }) => {
  const { data, error } = await supabase
    .from('gym_upi_config')
    .select('upi_id, merchant_name, merchant_code, currency')
    .eq('gym_id', gym.id)
    .maybeSingle()

  return NextResponse.json(
    { success: true, data: data ?? null },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
