'use server'

import { createClient } from '@/lib/supabase/server'
import { getMemberStatus, getDaysRemaining } from '@/lib/utils'
import type { MemberWithStatus } from '@/types'
import { formatMemberId } from '@/types'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'


export async function exportMembersToExcelAction(
  gymId: string, 
  statusFilter: string, 
  dateFrom: string, 
  dateTo: string
) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Verify ownership
    const { data: gym } = await supabase.from('gyms').select('id').eq('id', gymId).eq('owner_id', user.id).single()
    if (!gym) throw new Error("Unauthorized Gym Access")

    // Fetch ALL members for the gym (no limit)
    // We only need fields for export
    const { data: members, error } = await supabase
      .from('members')
      .select(`
        id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at, legacy_member_id,
        memberships(
          plan, start_date, end_date, amount, category, created_at
        )
      `)
      .eq('gym_id', gym.id)

    if (error) throw error

    // Transform and map status
    let mapped = (members ?? []).map((m: any) => {
      const memberships = m.memberships ?? []
      const sortedByCreated = [...memberships].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = sortedByCreated[0] ?? null
      
      const sortedByStartDate = [...memberships].sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0
        return dateA - dateB
      })
      const oldest = sortedByStartDate[0] ?? null
      const join_date = oldest?.start_date?.substring(0, 10) || m.created_at?.substring(0, 10) || ""
      const status = latest ? getMemberStatus(latest.end_date) : 'expired'

      return {
        ...m,
        latest_membership: latest,
        status,
        join_date
      }
    })

    // Apply filters
    if (statusFilter !== 'all') {
      mapped = mapped.filter(m => m.status === statusFilter)
    }

    if (dateFrom && dateTo) {
      const fromD = new Date(dateFrom)
      const toD = new Date(dateTo)
      mapped = mapped.filter(m => {
        if (!m.join_date) return false
        const [y, mo, d] = m.join_date.split('-').map(Number)
        const jd = new Date(y, mo - 1, d)
        return jd >= fromD && jd <= toD
      })
    }

    // Generate Excel
    const ExcelJS = (await import('exceljs')).default
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Members')

    ws.columns = [
      { header: 'Member ID',      key: 'num',      width: 15 },
      { header: 'Name',           key: 'name',     width: 25 },
      { header: 'Phone',          key: 'phone',    width: 15 },
      { header: 'Status',         key: 'status',   width: 15 },
      { header: 'Gender',         key: 'gender',   width: 10 },
      { header: 'Age',            key: 'age',      width: 8 },
      { header: 'Area',           key: 'area',     width: 20 },
      { header: 'Pending Dues',   key: 'dues',     width: 15 },
      { header: 'Latest Plan',    key: 'plan',     width: 15 },
      { header: 'Category',       key: 'category', width: 15 },
      { header: 'Join Date',      key: 'joined',   width: 15 },
      { header: 'Plan Starts On', key: 'start',    width: 15 },
      { header: 'Plan Ends On',   key: 'end',      width: 15 },
      { header: 'Legacy ID',      key: 'legacy',   width: 15 },
    ]
    
    ws.getRow(1).font = { bold: true }
    
    mapped.forEach(m => {
      ws.addRow({
        num:    m.member_number ? formatMemberId(m.member_number) : '-',
        name:   m.name,
        phone:  m.phone,
        status: m.status.toUpperCase(),
        gender: m.gender ? m.gender.charAt(0).toUpperCase() + m.gender.slice(1) : '-',
        age:    m.age || '-',
        area:   m.area || '-',
        dues:   m.pending_amount || 0,
        plan:   m.latest_membership ? m.latest_membership.plan : '-',
        category: m.latest_membership ? (m.latest_membership.category === 'both' || !m.latest_membership.category ? 'Strength + Cardio' : m.latest_membership.category.charAt(0).toUpperCase() + m.latest_membership.category.slice(1)) : '-',
        joined: m.join_date,
        start:  m.latest_membership?.start_date || '-',
        end:    m.latest_membership?.end_date || '-',
        legacy: m.legacy_member_id || '-',
      })
    })

    const buffer = await wb.xlsx.writeBuffer()
    // Convert arraybuffer to base64
    const base64 = Buffer.from(buffer).toString('base64')
    
    return { success: true, fileBase64: base64, count: mapped.length }

  } catch (error: any) {
    console.error("Export error:", error)
    return { success: false, error: error.message }
  }
}

// Action to load next batch of members
export async function loadMoreMembersAction(gymId: string, offset: number, limit: number) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    // Fetch members offset
    const { data: members, error } = await supabase
      .from('members')
      .select(`
        id, gym_id, member_number, name, phone, gender, age, area, pending_amount, created_at, legacy_member_id,
        memberships(
          id, plan, start_date, end_date, amount, payment_mode, category, created_at, member_id, gym_id
        )
      `)
      .eq('gym_id', gymId)
      .order('name')
      .range(offset, offset + limit - 1)

    if (error) throw error

    const result: MemberWithStatus[] = (members ?? []).map((m: any) => {
      const memberships = m.memberships ?? []
      const sortedByCreated = [...memberships].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      const latest = sortedByCreated[0] ?? null
      
      const sortedByStartDate = [...memberships].sort((a, b) => {
        const dateA = a.start_date ? new Date(a.start_date).getTime() : 0
        const dateB = b.start_date ? new Date(b.start_date).getTime() : 0
        return dateA - dateB
      })
      const oldest = sortedByStartDate[0] ?? null
      const join_date = oldest?.start_date?.substring(0, 10) || m.created_at?.substring(0, 10) || ""
      const status = latest ? getMemberStatus(latest.end_date) : 'expired'
      const days_remaining = latest ? getDaysRemaining(latest.end_date) : -999

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
        legacy_member_id: m.legacy_member_id
      }
    }).sort((a, b) => {
      const order = { expiring: 0, active: 1, expired: 2 }
      return order[a.status] - order[b.status]
    })

    return { success: true, data: result }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}


export async function invalidateMembersCache(gymId: string) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error("Unauthorized")

    const { data: gym } = await supabase.from('gyms').select('id').eq('id', gymId).eq('owner_id', user.id).single()
    if (!gym) throw new Error("Unauthorized Gym Access")

    await deleteCache(cacheKeys.membersList(gym.id))
    await deleteCache(cacheKeys.dashboard(gym.id, format(new Date(), 'yyyy-MM-dd')))
    await deleteCache(cacheKeys.payments12mo(gym.id))
    await deleteCache(cacheKeys.paymentsAll(gym.id))
    return { success: true }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}
