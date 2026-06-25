'use client'

import { useState, useRef, useEffect } from 'react'
import { CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { format } from 'date-fns'

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
  const [memberId, setMemberId] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [message, setMessage] = useState<MessageState>({ type: null, text: '' })
  const [totalPresent, setTotalPresent] = useState(initialPresent)
  const inputRef = useRef<HTMLInputElement>(null)
  
  const supabase = createClient()
  const displayDate = format(new Date(today), 'EEEE, dd MMM yyyy')

  // Auto focus input on mount
  useEffect(() => {
    inputRef.current?.focus()
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
      // 1. Find member
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

      // 2. Check today's attendance
      const { data: attData, error: attError } = await supabase
        .from('attendance')
        .select('id, created_at, check_out_time')
        .eq('gym_id', gymId)
        .eq('member_id', memberData.id)
        .eq('date', today)
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
    <div className="relative w-full h-[85vh] flex flex-col items-center justify-center p-4 md:p-8 animate-slide-up overflow-hidden rounded-3xl">
      <div className="w-full max-w-5xl flex flex-col items-center z-10">
        
        <div className="text-center mb-10 md:mb-12">
          <h1 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tight mb-2">
            {gymName}
          </h1>
          <p className="text-base md:text-lg text-slate-500 font-bold tracking-widest uppercase">Self-Service Attendance</p>
          <p className="text-sm text-slate-400 mt-2">{displayDate}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-4">
            <label htmlFor="memberId" className="block text-sm md:text-base font-bold text-slate-400 text-center uppercase tracking-widest">
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
              className="w-full text-center text-5xl md:text-6xl font-black text-brand-600 bg-transparent border-b-2 border-slate-200 py-4 focus:border-brand-500 transition-colors outline-none placeholder:text-slate-200 placeholder:font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !memberId.trim()}
            className="w-full max-w-sm mt-10 bg-slate-900 hover:bg-slate-800 text-white rounded-full py-4 md:py-5 font-bold text-lg md:text-xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-3 shadow-xl shadow-slate-900/20"
          >
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin" />
            ) : (
              'Confirm'
            )}
          </button>
        </form>

        <div className="mt-12 text-center">
          <p className="text-base font-bold text-slate-400">
            Total Checked-in Today: <span className="text-slate-700 bg-white shadow-sm px-4 py-1.5 rounded-full border border-slate-100 ml-2">{totalPresent}</span>
          </p>
        </div>

      </div>

      {/* Success / Error Overlay */}
      <div className={cn(
        "absolute inset-0 z-50 flex flex-col items-center justify-center p-8 text-center transition-all duration-300 backdrop-blur-md rounded-3xl",
        message.type === 'success' ? 'bg-emerald-500/95 text-white opacity-100 visible' :
        message.type === 'error' ? 'bg-red-500/95 text-white opacity-100 visible' :
        message.type === 'info' ? 'bg-amber-500/95 text-white opacity-100 visible' :
        'opacity-0 invisible pointer-events-none'
      )}>
        {message.type === 'success' && <CheckCircle2 className="w-20 h-20 md:w-24 md:h-24 mb-6 md:mb-8 animate-bounce drop-shadow-lg" />}
        {message.type === 'error' && <XCircle className="w-20 h-20 md:w-24 md:h-24 mb-6 md:mb-8 drop-shadow-lg" />}
        {message.type === 'info' && <CheckCircle2 className="w-20 h-20 md:w-24 md:h-24 mb-6 md:mb-8 drop-shadow-lg" />}
        
        <h2 className="text-3xl md:text-5xl font-black leading-tight drop-shadow-md mb-8 max-w-4xl">
          {message.text}
        </h2>

        {message.attendanceInfo && (
           <div className="bg-white text-slate-800 rounded-3xl p-5 mb-6 shadow-2xl w-full max-w-md ring-4 ring-white/20">
             {message.attendanceInfo.duration ? (
               <div className="text-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Workout Duration</p>
                 <p className="text-3xl font-black text-emerald-600 my-1">{message.attendanceInfo.duration}</p>
                 <p className="text-xs font-semibold text-slate-500 mt-2">
                   <span className="bg-slate-100 px-2 py-1 rounded-md">In: {message.attendanceInfo.checkInTime}</span> 
                   <span className="mx-2 text-slate-300">&bull;</span> 
                   <span className="bg-slate-100 px-2 py-1 rounded-md">Out: {message.attendanceInfo.checkOutTime}</span>
                 </p>
               </div>
             ) : (
               <div className="text-center">
                 <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-1">Check-in Time</p>
                 <p className="text-3xl font-black text-emerald-600 my-1">{message.attendanceInfo.checkInTime}</p>
               </div>
             )}
           </div>
        )}

        {message.memberInfo && (
          <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-6 w-full max-w-lg text-left border border-white/20 shadow-xl">
            <div className="grid grid-cols-2 gap-4 md:gap-6">
              <div className="col-span-2 md:col-span-1">
                <p className="text-[10px] md:text-xs uppercase text-white/80 font-bold tracking-widest mb-1">Name</p>
                <p className="font-bold text-xl md:text-2xl leading-tight truncate drop-shadow-sm">{message.memberInfo.name}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-[10px] md:text-xs uppercase text-white/80 font-bold tracking-widest mb-1">ID</p>
                <p className="font-bold text-xl md:text-2xl leading-tight drop-shadow-sm">{message.memberInfo.memberId}</p>
              </div>
              <div className="col-span-2">
                <p className="text-[10px] md:text-xs uppercase text-white/80 font-bold tracking-widest mb-1">Plan Expires</p>
                <p className="font-bold text-xl md:text-2xl leading-tight drop-shadow-sm">{message.memberInfo.expiryDate}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
