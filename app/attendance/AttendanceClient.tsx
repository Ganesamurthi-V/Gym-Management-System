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
    <div className="min-h-[75vh] flex flex-col items-center justify-center p-4 animate-slide-up">
      <div className="w-full max-w-md">
        
        <div className="text-center mb-8">
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight mb-2">
            {gymName}
          </h1>
          <p className="text-slate-500 font-medium tracking-wide uppercase text-sm">Self-Service Attendance</p>
          <p className="text-xs text-slate-400 mt-1.5">{displayDate}</p>
        </div>

        <div className="card p-6 md:p-8 shadow-2xl shadow-slate-200/50 relative overflow-hidden bg-white border-0 ring-1 ring-slate-100">
          
          <form onSubmit={handleSubmit} className="space-y-6 relative z-10">
            <div className="space-y-3">
              <label htmlFor="memberId" className="block text-sm font-bold text-slate-400 text-center uppercase tracking-wider">
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
                placeholder="e.g. 1042"
                className="w-full text-center text-4xl font-black text-brand-600 bg-slate-50 border-2 border-slate-200 rounded-2xl py-5 focus:border-brand-500 focus:ring-4 focus:ring-brand-500/20 transition-all outline-none placeholder:text-slate-300 placeholder:font-normal"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading || !memberId.trim()}
              className="w-full bg-slate-900 hover:bg-slate-800 text-white rounded-2xl py-4 font-bold text-lg transition-all active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 flex items-center justify-center gap-2 shadow-lg shadow-slate-900/20"
            >
              {isLoading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                'Confirm'
              )}
            </button>
          </form>

          {/* Success / Error Overlay */}
          <div className={cn(
            "absolute inset-0 z-20 flex flex-col items-center justify-center p-6 md:p-8 text-center transition-all duration-300",
            message.type === 'success' ? 'bg-gradient-to-br from-emerald-400 to-emerald-500 text-white opacity-100 visible' :
            message.type === 'error' ? 'bg-gradient-to-br from-red-400 to-red-500 text-white opacity-100 visible' :
            message.type === 'info' ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white opacity-100 visible' :
            'opacity-0 invisible pointer-events-none'
          )}>
            {message.type === 'success' && <CheckCircle2 className="w-16 h-16 mb-4 animate-bounce drop-shadow-md" />}
            {message.type === 'error' && <XCircle className="w-16 h-16 mb-4 drop-shadow-md" />}
            {message.type === 'info' && <CheckCircle2 className="w-16 h-16 mb-4 drop-shadow-md" />}
            
            <h2 className="text-2xl md:text-3xl font-black leading-tight drop-shadow-sm mb-6">
              {message.text}
            </h2>

            {message.memberInfo && (
              <div className="bg-white/20 backdrop-blur-sm rounded-2xl p-4 w-full text-left">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-[10px] uppercase text-white/70 font-bold tracking-wider">Name</p>
                    <p className="font-semibold text-lg leading-tight truncate">{message.memberInfo.name}</p>
                  </div>
                  <div className="col-span-2 md:col-span-1">
                    <p className="text-[10px] uppercase text-white/70 font-bold tracking-wider">ID</p>
                    <p className="font-semibold text-lg leading-tight">{message.memberInfo.memberId}</p>
                  </div>
                  <div className="col-span-2">
                    <p className="text-[10px] uppercase text-white/70 font-bold tracking-wider">Plan Expires</p>
                    <p className="font-semibold text-lg leading-tight">{message.memberInfo.expiryDate}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

        </div>

        <div className="mt-8 text-center">
          <p className="text-sm font-bold text-slate-400">
            Total Checked-in Today: <span className="text-slate-700 bg-white shadow-sm px-3 py-1 rounded-full border border-slate-100 ml-1">{totalPresent}</span>
          </p>
        </div>

      </div>
    </div>
  )
}
