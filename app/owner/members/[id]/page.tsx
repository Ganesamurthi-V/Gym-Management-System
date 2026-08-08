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

  // Parallel fetching instead of sequential waterfall. The gym name is joined
  // into the member query (gym:gyms(name)) to eliminate a separate round-trip.
  const [{ data: member }, { data: memberships }, { data: attendance }] = await Promise.all([
    supabase
      .from('members')
      .select('id, gym_id, member_number, name, phone, gender, age, date_of_birth, area, pending_amount, created_at, legacy_member_id, is_imported, gym:gyms(name)')
      .eq('id', id)
      .single(),
    supabase
      .from('memberships')
      .select('*')
      .eq('member_id', id)
      .order('created_at', { ascending: false })
      .limit(5),
    supabase
      .from('attendance')
      .select('*')
      .eq('member_id', id)
      .order('date', { ascending: false })
      .limit(10),
  ])

  if (!member) notFound()

  const gym = Array.isArray(member.gym) ? member.gym[0] : member.gym

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
      gymName={gym?.name}
    />
  )
}