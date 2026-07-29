import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import ActivateClient from './ActivateClient'

export const dynamic = 'force-dynamic'

export default async function ActivatePage(props: { params: Promise<{ token: string }> }) {
  const { token } = await props.params

  if (!token || token.length < 20) notFound()

  const supabase = await createClient()

  // Find the Auth user whose invitation_token matches
  // We query the members table with a service-role approach is not possible here
  // since we use the anon key. Instead, we'll use a public API route.
  // For security, the token lookup happens client-side via an API call.

  return <ActivateClient token={token} />
}
