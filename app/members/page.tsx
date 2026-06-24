import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/server'
import { MembersClient } from './MembersClient'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'

export const revalidate = 0

const PAGE_SIZE = 200

export default async function MembersPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return null

  // Paginated fetch — only select columns needed for the list view
  const { data: members } = await supabase
    .from('members')
    .select(`
      id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at,
      memberships(
        id, plan, start_date, end_date, amount, payment_mode, created_at, member_id, gym_id
      )
    `)
    .eq('gym_id', gym.id)
    .order('name')
    .limit(PAGE_SIZE)

  const result: MemberWithStatus[] = (members ?? []).map(m => {
    const memberships = m.memberships as any[] ?? [];
    
    // Latest membership for status
    const sortedByCreated = [...memberships].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    const latest = sortedByCreated[0] ?? null;
    
    // Oldest membership for join date
    const sortedByStartDate = [...memberships].sort((a, b) => {
      const dateA = a.start_date ? new Date(a.start_date).getTime() : 0;
      const dateB = b.start_date ? new Date(b.start_date).getTime() : 0;
      return dateA - dateB;
    });
    const oldest = sortedByStartDate[0] ?? null;
    
    // Fallback to created_at (date part) if no memberships
    const join_date = oldest?.start_date?.substring(0, 10) || m.created_at?.substring(0, 10) || "";
    
    const status = latest ? getMemberStatus(latest.end_date) : 'expired';
    const days_remaining = latest ? getDaysRemaining(latest.end_date) : -999;
    
    return {
      id: m.id,
      gym_id: m.gym_id,
      member_number: m.member_number,
      name: m.name,
      phone: m.phone,
      gender: m.gender,
      age: m.age,
      area: m.area,
      pending_amount: m.pending_amount,
      created_at: m.created_at,
      latest_membership: latest,
      status,
      days_remaining,
      join_date,
    }
  }).sort((a, b) => {
    const order = { expiring: 0, active: 1, expired: 2 }
    return order[a.status] - order[b.status]
  })

  return (
    <Suspense fallback={<div className="p-8 text-center text-slate-500">Loading members...</div>}>
      <MembersClient members={result} gymId={gym.id} />
    </Suspense>
  )
}
