import { NextRequest, NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/import/plan-prices
 *
 * Returns the configured plan prices for the authenticated user's gym, used by
 * the import pipeline to auto-fill rows whose amount is missing or zero.
 *
 * Replaces the two direct browser queries the pipeline used to make
 * (`gyms` to resolve the gym, then `gym_plan_prices`), which were the last
 * reason `lib/import/pipeline.ts` needed a browser Supabase client at all.
 *
 * `found: false` means the gym has no gym_plan_prices row yet — the pipeline
 * treats every price as 0 in that case, matching the previous behaviour.
 */
export const GET = withAuth('IMPORT_PLAN_PRICES', async (_req: NextRequest, { supabase, gym }) => {
  const { data, error } = await supabase
    .from('gym_plan_prices')
    .select('monthly, quarterly, annual')
    .eq('gym_id', gym.id)
    .maybeSingle()

  if (error) {
    return NextResponse.json(
      { success: false, error: { code: 'DATABASE_ERROR', message: 'Could not load plan prices' } },
      { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
    )
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        found: Boolean(data),
        plan_prices: {
          monthly: data?.monthly ?? 0,
          quarterly: data?.quarterly ?? 0,
          annual: data?.annual ?? 0,
        },
      },
    },
    { headers: { 'Cache-Control': 'private, no-store' } }
  )
})
