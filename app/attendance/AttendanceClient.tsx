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
        .select('id, check_out_time')
        .eq('gym_id', gymId)
        .eq('member_id', memberData.id)
        .eq('date', today)
        .maybeSingle()

      if (!attData) {
        // Check In
        const { error: insertError } = await supabase
          .from('attendance')
          .insert({
            gym_id: gymId,
            member_id: memberData.id,
            date: today
          })

        if (insertError) throw insertError
        
        setTotalPresent(p => p + 1)
        setMessage({ type: 'success', text: `Checked IN successfully.`, memberInfo })
      } else {
        // Record exists
        if (!attData.check_out_time) {
          // Check Out
          const { error: updateError } = await supabase
            .from('attendance')
            .update({ check_out_time: new Date().toISOString() })
            .eq('id', attData.id)

          if (updateError) throw updateError
          
          setMessage({ type: 'success', text: `Checked OUT successfully.`, memberInfo })
        } else {
          // Already checked out
          setMessage({ type: 'info', text: `Already checked out today.`, memberInfo })
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
        
        <div className="text-center mb-10 md:mb-16">
          <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tight mb-3">
            {gymName}
          </h1>
          <p className="text-lg md:text-xl text-slate-500 font-bold tracking-widest uppercase">Self-Service Attendance</p>
          <p className="text-sm text-slate-400 mt-2">{displayDate}</p>
        </div>

        <form onSubmit={handleSubmit} className="w-full flex flex-col items-center">
          <div className="w-full max-w-3xl space-y-6">
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
              className="w-full text-center text-7xl md:text-9xl font-black text-brand-600 bg-transparent border-b-4 border-slate-200 py-6 focus:border-brand-500 transition-colors outline-none placeholder:text-slate-200 placeholder:font-bold"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !memberId.trim()}
            className="w-full max-w-sm mt-12 bg-slate-900 hover:bg-slate-800 text-white rounded-full py-5 md:py-6 font-bold text-xl md:text-2xl transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-3 shadow-xl shadow-slate-900/20"
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
        {message.type === 'success' && <CheckCircle2 className="w-24 h-24 md:w-32 md:h-32 mb-6 md:mb-8 animate-bounce drop-shadow-lg" />}
        {message.type === 'error' && <XCircle className="w-24 h-24 md:w-32 md:h-32 mb-6 md:mb-8 drop-shadow-lg" />}
        {message.type === 'info' && <CheckCircle2 className="w-24 h-24 md:w-32 md:h-32 mb-6 md:mb-8 drop-shadow-lg" />}
        
        <h2 className="text-4xl md:text-6xl font-black leading-tight drop-shadow-md mb-8 md:mb-12 max-w-4xl">
          {message.text}
        </h2>

        {message.memberInfo && (
          <div className="bg-white/20 backdrop-blur-lg rounded-3xl p-6 md:p-10 w-full max-w-2xl text-left border border-white/20 shadow-2xl">
            <div className="grid grid-cols-2 gap-6 md:gap-8">
              <div className="col-span-2 md:col-span-1">
                <p className="text-xs md:text-sm uppercase text-white/80 font-bold tracking-widest mb-1">Name</p>
                <p className="font-bold text-2xl md:text-3xl leading-tight truncate drop-shadow-sm">{message.memberInfo.name}</p>
              </div>
              <div className="col-span-2 md:col-span-1">
                <p className="text-xs md:text-sm uppercase text-white/80 font-bold tracking-widest mb-1">ID</p>
                <p className="font-bold text-2xl md:text-3xl leading-tight drop-shadow-sm">{message.memberInfo.memberId}</p>
              </div>
              <div className="col-span-2">
                <p className="text-xs md:text-sm uppercase text-white/80 font-bold tracking-widest mb-1">Plan Expires</p>
                <p className="font-bold text-2xl md:text-3xl leading-tight drop-shadow-sm">{message.memberInfo.expiryDate}</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
