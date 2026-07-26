import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'

/**
 * GET /api/subscriptions
 * Returns all subscription requests (pending first, then reviewed) with gym info and signed proof URLs.
 */
export async function GET(req: NextRequest) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const supabase = createAdminClient()

    const { data: requests, error } = await supabase
      .from('subscription_requests')
      .select(`
        id, status, submitted_at, reviewed_at,
        transaction_id, notes, rejection_reason, uploaded_file_url,
        gym_id,
        gyms ( id, name, owner_id, subscription_status, plan_type )
      `)
      .order('submitted_at', { ascending: false })
      .limit(100)

    if (error) throw error

    // Generate signed URLs for payment proofs
    const withUrls = await Promise.all(
      (requests ?? []).map(async (r) => {
        let signedUrl: string | null = null
        if (r.uploaded_file_url) {
          const { data } = await supabase.storage
            .from('payment-proofs')
            .createSignedUrl(r.uploaded_file_url, 3600)
          signedUrl = data?.signedUrl ?? null
        }
        return {
          ...r,
          signedUrl,
          gyms: Array.isArray(r.gyms) ? r.gyms[0] : r.gyms,
        }
      })
    )

    return NextResponse.json(withUrls)
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
