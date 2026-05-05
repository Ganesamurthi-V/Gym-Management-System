import { createClient } from '@/lib/supabase/server'
import { MemberDetailClient } from './MemberDetailClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import { notFound } from 'next/navigation'

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params // ✅ FIX HERE

  const supabase = await createClient()

  const { data: member } = await supabase
    .from('members')
    .select('*')
    .eq('id', id)
    .single()

  if (!member) notFound()

  const { data: memberships } = await supabase
    .from('memberships')
    .select('*')
    .eq('member_id', id)
    .order('created_at', { ascending: false })
    .limit(5)

  const { data: attendance } = await supabase
    .from('attendance')
    .select('*')
    .eq('member_id', id)
    .order('date', { ascending: false })
    .limit(10)

  const latestMembership = memberships?.[0] ?? null
  const status = latestMembership
    ? getMemberStatus(latestMembership.end_date)
    : 'expired'

  const daysRemaining = latestMembership
    ? getDaysRemaining(latestMembership.end_date)
    : -999

  return (
    <MemberDetailClient
      member={member}
      memberships={memberships ?? []}
      attendance={attendance ?? []}
      status={status}
      daysRemaining={daysRemaining}
    />
  )
}