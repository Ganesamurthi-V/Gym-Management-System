'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, Search } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

interface AttendanceMember {
  id: string
  name: string
  phone: string
  present: boolean
}

interface Props {
  members: AttendanceMember[]
  gymId: string
  today: string
  totalPresent: number
}

export function AttendanceClient({ members: initialMembers, gymId, today, totalPresent: initialPresent }: Props) {
  const [members, setMembers] = useState(initialMembers)
  const [search, setSearch] = useState('')
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set())
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const totalPresent = members.filter(m => m.present).length
  const attendanceRate = members.length > 0 ? Math.round((totalPresent / members.length) * 100) : 0
  const displayDate = format(new Date(today), 'EEEE, dd MMM yyyy')

  async function toggleAttendance(memberId: string, isPresent: boolean) {
    if (loadingIds.has(memberId)) return
    setLoadingIds(prev => new Set(prev).add(memberId))
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, present: !isPresent } : m))
    if (isPresent) {
      const { error } = await supabase.from('attendance').delete().eq('member_id', memberId).eq('date', today).eq('gym_id', gymId)
      if (error) setMembers(prev => prev.map(m => m.id === memberId ? { ...m, present: isPresent } : m))
    } else {
      const { error } = await supabase.from('attendance').insert({ member_id: memberId, gym_id: gymId, date: today })
      if (error) setMembers(prev => prev.map(m => m.id === memberId ? { ...m, present: isPresent } : m))
    }
    setLoadingIds(prev => { const s = new Set(prev); s.delete(memberId); return s })
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) || m.phone.includes(search)
  )

  return (
    <div className="space-y-4 md:space-y-5 max-w-7xl mx-auto">
      {/* Page header */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Attendance</h1>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">{displayDate}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="card px-3 py-2 text-center">
            <p className="text-lg md:text-xl font-bold text-emerald-600">{totalPresent}</p>
            <p className="text-[10px] md:text-xs text-slate-400">Present</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-lg md:text-xl font-bold text-slate-500">{members.length - totalPresent}</p>
            <p className="text-[10px] md:text-xs text-slate-400">Absent</p>
          </div>
          <div className="card px-3 py-2 text-center">
            <p className="text-lg md:text-xl font-bold text-blue-600">{attendanceRate}%</p>
            <p className="text-[10px] md:text-xs text-slate-400">Rate</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 rounded-full transition-all duration-500"
          style={{ width: `${attendanceRate}%` }} />
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="search" placeholder="Search member..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {/* Members grid — 1 col mobile, 2 col tablet, 3 col desktop */}
      {filtered.length === 0 ? (
        <div className="card p-12 text-center text-slate-400">No active members found</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
          {filtered.map((member) => (
            <button key={member.id}
              onClick={() => toggleAttendance(member.id, member.present)}
              className={cn(
                'card p-3.5 flex items-center gap-3 text-left active:scale-[0.99] transition-all',
                member.present ? 'border-emerald-200 bg-emerald-50' : 'hover:border-slate-300'
              )}
            >
              {member.present
                ? <CheckCircle2 className="w-6 h-6 text-emerald-500 flex-shrink-0" />
                : <Circle className="w-6 h-6 text-slate-200 flex-shrink-0" />
              }
              <div className="flex-1 min-w-0">
                <p className={cn('font-semibold truncate text-sm', member.present ? 'text-emerald-800' : 'text-slate-900')}>{member.name}</p>
                <p className={cn('text-xs mt-0.5', member.present ? 'text-emerald-600 font-medium' : 'text-slate-400')}>
                  {member.present ? '✓ Present' : 'Tap to mark'}
                </p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
