'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Circle, CalendarCheck, Search } from 'lucide-react'
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
  const [isPending, startTransition] = useTransition()
  const supabase = createClient()

  const totalPresent = members.filter(m => m.present).length

  async function toggleAttendance(memberId: string, isPresent: boolean) {
    // Optimistic update
    setMembers(prev =>
      prev.map(m => m.id === memberId ? { ...m, present: !isPresent } : m)
    )

    if (isPresent) {
      // Remove attendance
      await supabase
        .from('attendance')
        .delete()
        .eq('member_id', memberId)
        .eq('date', today)
        .eq('gym_id', gymId)
    } else {
      // Add attendance
      const { error } = await supabase.from('attendance').insert({
        member_id: memberId,
        gym_id: gymId,
        date: today,
      })

      if (error) {
        // Revert on error
        setMembers(prev =>
          prev.map(m => m.id === memberId ? { ...m, present: isPresent } : m)
        )
      }
    }
  }

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search)
  )

  const displayDate = format(new Date(today), 'EEEE, dd MMM yyyy')

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-2 mb-1">
          <CalendarCheck className="w-5 h-5 text-brand-600" />
          <h1 className="text-xl font-bold text-gray-900">Attendance</h1>
        </div>
        <p className="text-sm text-gray-500 mb-3">{displayDate}</p>

        {/* Count */}
        <div className="flex items-center gap-3 mb-3">
          <div className="bg-brand-50 text-brand-700 px-3 py-1.5 rounded-xl text-sm font-semibold">
            {totalPresent} present
          </div>
          <div className="bg-gray-100 text-gray-600 px-3 py-1.5 rounded-xl text-sm font-medium">
            {members.length - totalPresent} absent
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="search"
            placeholder="Search member..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input-field pl-10 py-3"
          />
        </div>
      </div>

      <div className="px-4 py-4 space-y-2">
        {filtered.length === 0 ? (
          <div className="card p-8 text-center text-gray-400 text-sm">
            No active members found
          </div>
        ) : (
          filtered.map((member) => (
            <button
              key={member.id}
              onClick={() => toggleAttendance(member.id, member.present)}
              className={cn(
                'w-full card p-4 flex items-center gap-4 active:scale-[0.99] transition-all text-left',
                member.present ? 'border-green-200 bg-green-50' : ''
              )}
            >
              {member.present ? (
                <CheckCircle2 className="w-7 h-7 text-green-500 flex-shrink-0" />
              ) : (
                <Circle className="w-7 h-7 text-gray-300 flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className={cn(
                  'font-semibold truncate',
                  member.present ? 'text-green-800' : 'text-gray-900'
                )}>
                  {member.name}
                </p>
                <p className={cn(
                  'text-sm',
                  member.present ? 'text-green-600' : 'text-gray-500'
                )}>
                  {member.present ? 'Present ✓' : 'Tap to mark present'}
                </p>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  )
}
