import { createAdminClient } from '@/lib/supabase/admin'
import AdminSubscriptionList from './AdminSubscriptionList'

export const revalidate = 0

export default async function AdminSubscriptionsPage() {
  const supabase = createAdminClient()

  const { data: requests } = await supabase
    .from('subscription_requests')
    .select(`
      id, status, submitted_at, reviewed_at,
      transaction_id, notes, rejection_reason, uploaded_file_url,
      gyms ( id, name, owner_id )
    `)
    .order('submitted_at', { ascending: false })

  const requestsWithUrls = await Promise.all(
    (requests ?? []).map(async (r) => {
      let signedUrl = null
      if (r.uploaded_file_url) {
        const { data } = await supabase.storage
          .from('payment-proofs')
          .createSignedUrl(r.uploaded_file_url, 3600) // 1-hour expiry
        signedUrl = data?.signedUrl ?? null
      }
      return { 
        ...r, 
        signedUrl,
        gyms: Array.isArray(r.gyms) ? r.gyms[0] : r.gyms
      }
    })
  )

  return <AdminSubscriptionList requests={requestsWithUrls as any} />
}
