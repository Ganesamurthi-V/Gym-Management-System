'use client'

import { useState, useRef, useEffect, useMemo } from 'react'
import { CheckCircle2, XCircle, Loader2, Sun, Moon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'
import { useGymRealtime } from '@/lib/hooks/useGymRealtime'

interface Props {
  gymId: string
  gymName: string
  today: string
  totalPresent: number
}

type MessageState = {
  type: 'success' | 'error' | 'info' | null
  text: string
  memberInfo?: {
    name: string
    memberId: string
    expiryDate: string
  }
  attendanceInfo?: {
    checkInTime: string
    checkOutTime?: string
    duration?: string
  }
}

export function AttendanceClient({ gymId, gymName, today, totalPresent: initialPresent }: Props) {
  // Auto-refresh when attendance records are added/modified.
  useGymRealtime(gymId, ['attendance'])
  const [memberId, setMemberId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<MessageState>({ type: null, text: '' })
  const [totalPresent, setTotalPresent] = useState(initialPresent)
  const [sessionType, setSessionType] = useState<'morning' | 'evening'>('morning')
  const inputRef = useRef<HTMLInputElement>(null)
  
  const supabase = useMemo(() => createClient(), [])
  const displayDate = format(new Date(today), 'EEEE, dd MMM yyyy')

  // Auto focus input on mount, and set session based on time
  useEffect(() => {
    inputRef.current?.focus()
    const hour = new Date().getHours()
    if (hour >= 14) {
      setSessionType('evening')
    } else {
      setSessionType('morning')
    }
  }, [])

  // Auto clear message after 4 seconds
  useEffect(() => {
    if (message.type) {
      const t = setTimeout(() => {
        setMessage({ type: null, text: '' })
        setMemberId('')
        inputRef.current?.focus()
      }, 4000)
      return () => clearTimeout(t)
    }
  }, [message])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!memberId.trim()) return

    const numId = parseInt(memberId.trim(), 10)
    if (isNaN(numId)) {
      setMessage({ type: 'error', text: 'Please enter a valid numeric Member ID.' })
      return
    }

    setIsLoading(true)
    setMessage({ type: null, text: '' })

    try {
      // 1. Find member — only fetch latest membership end_date
      const { data: memberData, error: memberError } = await supabase
        .from('members')
        .select(`
          id, 
          name,
          member_number,
          memberships(end_date)
        `)
        .eq('gym_id', gymId)
        .eq('member_number', numId)
        .order('created_at', { referencedTable: 'memberships', ascending: false })
        .limit(1, { referencedTable: 'memberships' })
        .single()

      if (memberError || !memberData) {
        setMessage({ type: 'error', text: 'Member ID not found. Please try again.' })
        return
      }

      const memberships = memberData.memberships as { end_date: string }[] ?? []
      const latestEndDate = memberships.reduce((max, ms) => ms.end_date > max ? ms.end_date : max, '')
      const expiryText = latestEndDate ? format(new Date(latestEndDate), 'dd MMM yyyy') : 'No active plan'
      const formattedId = `GF${String(memberData.member_number).padStart(4, '0')}`

      const memberInfo = {
        name: memberData.name,
        memberId: formattedId,
        expiryDate: expiryText
      }

      // 2. Check today's attendance for the specific session
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('id, created_at, check_out_time')
        .eq('gym_id', gymId)
        .eq('member_id', memberData.id)
        .eq('date', today)
        .eq('session', sessionType)
        .maybeSingle()

      if (!attData) {
        // Check In
        const now = new Date()
        const { error: insertError } = await supabase
          .from('attendance')
          .insert({
            gym_id: gymId,
            member_id: memberData.id,
            date: today,
            session: sessionType,
            created_at: now.toISOString()
          })

        if (insertError) throw insertError
        
        setTotalPresent(p => p + 1)
        setMessage({ 
          type: 'success', 
          text: `Checked IN successfully.`, 
          memberInfo,
          attendanceInfo: { checkInTime: format(now, 'hh:mm a') }
        })
      } else {
        // Record exists
        const checkInDate = new Date(attData.created_at)

        if (!attData.check_out_time) {
          // Check Out
          const now = new Date()
          const { error: updateError } = await supabase
            .from('attendance')
            .update({ check_out_time: now.toISOString() })
            .eq('id', attData.id)

          if (updateError) throw updateError
          
          const diffMs = now.getTime() - checkInDate.getTime()
          const diffMins = Math.floor(diffMs / 60000)
          const hrs = Math.floor(diffMins / 60)
          const mins = diffMins % 60
          let durationStr = ''
          if (hrs > 0) durationStr += `${hrs}hr `
          durationStr += `${mins}min`

          setMessage({ 
            type: 'success', 
            text: `Checked OUT successfully.`, 
            memberInfo,
            attendanceInfo: {
              checkInTime: format(checkInDate, 'hh:mm a'),
              checkOutTime: format(now, 'hh:mm a'),
              duration: durationStr.trim()
            }
          })
        } else {
          // Already checked out
          const checkOutDate = new Date(attData.check_out_time)
          const diffMs = checkOutDate.getTime() - checkInDate.getTime()
          const diffMins = Math.floor(diffMs / 60000)
          const hrs = Math.floor(diffMins / 60)
          const mins = diffMins % 60
          let durationStr = ''
          if (hrs > 0) durationStr += `${hrs}hr `
          durationStr += `${mins}min`

          setMessage({ 
            type: 'info', 
            text: `Already checked out today.`, 
            memberInfo,
            attendanceInfo: {
              checkInTime: format(checkInDate, 'hh:mm a'),
              checkOutTime: format(checkOutDate, 'hh:mm a'),
              duration: durationStr.trim()
            }
          })
        }
      }
    } catch (err: any) {
      console.error(err)
      setMessage({ type: 'error', text: 'An error occurred. Please try again.' })
    } finally {
      setIsLoading(false)
      setMemberId('')
      inputRef.current?.focus()
    }
  }

  return (
    <div className="relative w-full min-h-[80vh] flex flex-col items-center justify-center p-3 xs:p-4 md:p-8 animate-slide-up overflow-hidden rounded-2xl xs:rounded-3xl">
      
      {/* Session Toggle */}
      <div className="absolute top-3 right-3 xs:top-4 xs:right-4 md:top-8 md:right-8 z-20">
        <div className="bg-white/80 backdrop-blur-md rounded-full p-1 shadow-md border border-slate-200 flex items-center">
          <button
            type="button"
            onClick={() => { setSessionType('morning'); inputRef.current?.focus() }}
            className={cn(
              "flex items-center gap-1 xs:gap-2 px-2.5 xs:px-4 py-1.5 xs:py-2 rounded-full text-xs xs:text-sm font-bold transition-all",
              sessionType === 'morning' 
                ? "bg-brand-50 text-brand-700 shadow-sm" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <Sun className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
            <span className="hidden xs:inline">Morning</span>
          </button>
          <button
            type="button"
            onClick={() => { setSessionType('evening'); inputRef.current?.focus() }}
            className={cn(
              "flex items-center gap-1 xs:gap-2 px-2.5 xs:px-4 py-1.5 xs:py-2 rounded-full text-xs xs:text-sm font-bold transition-all",
              sessionType === 'evening' 
                ? "bg-brand-50 text-brand-700 shadow-sm" 
                : "text-slate-400 hover:text-slate-600 hover:bg-slate-50"
            )}
          >
            <Moon className="w-3.5 h-3.5 xs:w-4 xs:h-4" />
            <span className="hidden xs:inline">Evening</span>
          </button>
        </div>
      </div>

      <div className="w-full max-w-5xl flex flex-col items-center z-10">
        
        <div className="text-center mb-8 xs:mb-10 md:mb-12">
          <h1 className="text-2xl xs:text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-2">
            {gymName}
          </h1>
          <p className="text-sm xs:text-base md:text-lg text-slate-500 font-bold tracking-widest uppercase">Self-Service Attendance</p>
          <p className="text-xs xs:text-sm text-slate-400 mt-2">{displayDate}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-3 xs:space-y-4">
            <label htmlFor="memberId" className="block text-xs xs:text-sm md:text-base font-bold text-slate-400 text-center uppercase tracking-widest">
              Enter your Member ID
            </label>
            <input
              ref={inputRef}
              id="memberId"
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              disabled={isLoading}
              value={memberId}
              onChange={(e) => setMemberId(e.target.value)}
              placeholder="1042"
              className="w-full text-center text-4xl xs:text-5xl md:text-6xl font-black text-brand-600 bg-transparent border-b-2 border-slate-200 py-3 xs:py-4 focus:border-brand-500 transition-colors outline-none placeholder:text-slate-200 placeholder:font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !memberId.trim()}
            className="w-full max-w-sm mt-8 xs:mt-10 bg-slate-900 hover:bg-slate-800 text-white rounded-full py-3.5 xs:py-4 md:py-5 font-bold text-base xs:text-lg md:text-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-3 shadow-xl shadow-slate-900/20"
          >
            {isLoading ? (
              <Loader2 className="w-6 h-6 xs:w-8 xs:h-8 animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
        </form>

        <div className="mt-8 xs:mt-12 text-center">
          <p className="text-sm xs:text-base font-bold text-slate-400">
            Total Checked-in Today: <span className="text-slate-700 bg-white shadow-sm px-3 xs:px-4 py-1 xs:py-1.5 rounded-full border border-slate-100 ml-2">{totalPresent}</span>
          </p>
        </div>

      </div>

      {/* Success / Error Overlay Modal */}
      <div className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center p-4 text-center transition-all duration-300 rounded-3xl",
        message.type !== null ? 'bg-slate-900/40 backdrop-blur-md opacity-100 visible' : 'opacity-0 invisible pointer-events-none'
      )}>
        
        {/* Modal Card */}
        <div className={cn(
          "bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-6 md:p-8 flex flex-col items-center border border-slate-100 transform transition-all duration-300",
          message.type !== null ? 'scale-100 translate-y-0' : 'scale-95 translate-y-8'
        )}>
          
          {/* Icon */}
          <div className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-inner",
            message.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
            message.type === 'error'   ? 'bg-red-100 text-red-600' :
            'bg-amber-100 text-amber-600'
          )}>
            {message.type === 'success' && <CheckCircle2 className="w-10 h-10 animate-bounce" />}
            {message.type === 'error'   && <XCircle className="w-10 h-10" />}
            {message.type === 'info'    && <CheckCircle2 className="w-10 h-10" />}
          </div>
          
          <h2 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight tracking-tight mb-6">
            {message.text}
          </h2>

          {message.attendanceInfo && (
             <div className="w-full bg-slate-50 rounded-2xl p-5 mb-4 border border-slate-100">
               {message.attendanceInfo.duration ? (
                 <div className="text-center">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Workout Duration</p>
                   <p className="text-3xl font-black text-brand-600">{message.attendanceInfo.duration}</p>
                   <div className="flex items-center justify-center gap-3 mt-3 text-xs font-semibold text-slate-500">
                     <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">In: {message.attendanceInfo.checkInTime}</span> 
                     <span className="bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-sm">Out: {message.attendanceInfo.checkOutTime}</span>
                   </div>
                 </div>
               ) : (
                 <div className="text-center">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Check-in Time</p>
                   <p className="text-3xl font-black text-brand-600">{message.attendanceInfo.checkInTime}</p>
                 </div>
               )}
             </div>
          )}

          {message.memberInfo && (
            <div className="w-full bg-slate-50 rounded-2xl p-5 text-left border border-slate-100">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-0.5">Member Name</p>
                  <p className="font-bold text-slate-900 text-lg">{message.memberInfo.name}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-0.5">ID</p>
                  <p className="font-bold text-slate-900">{message.memberInfo.memberId}</p>
                </div>
                <div>
                  <p className="text-[10px] uppercase text-slate-400 font-bold tracking-widest mb-0.5">Plan Expires</p>
                  <p className="font-bold text-slate-900">{message.memberInfo.expiryDate}</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
