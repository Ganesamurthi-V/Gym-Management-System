'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcEndDate, PLAN_LABELS } from '@/lib/utils'
import type { Plan, PaymentMode } from '@/types'
import { format } from 'date-fns'
import Link from 'next/link'

export default function NewMemberPage() {
  const router = useRouter()
  const supabase = createClient()

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState({
    name: '',
    phone: '',
    plan: 'monthly' as Plan,
    start_date: format(new Date(), 'yyyy-MM-dd'),
    amount: '',
    payment_mode: 'cash' as PaymentMode,
  })

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Get gym id
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: gym } = await supabase
        .from('gyms')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!gym) throw new Error('Gym not found')

      // Check duplicate phone
      const { data: existing } = await supabase
        .from('members')
        .select('id')
        .eq('gym_id', gym.id)
        .eq('phone', form.phone)
        .single()

      if (existing) {
        setError('A member with this phone number already exists.')
        setLoading(false)
        return
      }

      // Create member
      const { data: member, error: memberError } = await supabase
        .from('members')
        .insert({
          gym_id: gym.id,
          name: form.name.trim(),
          phone: form.phone.trim(),
        })
        .select()
        .single()

      if (memberError) throw memberError

      // Create membership
      const end_date = calcEndDate(form.start_date, form.plan)
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          member_id: member.id,
          gym_id: gym.id,
          plan: form.plan,
          start_date: form.start_date,
          end_date,
          amount: parseInt(form.amount),
          payment_mode: form.payment_mode,
        })

      if (membershipError) throw membershipError

      router.push('/members')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setLoading(false)
    }
  }

  const endDate = form.start_date ? calcEndDate(form.start_date, form.plan) : null

  return (
    <div>
      {/* Header */}
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link href="/members" className="p-2 -ml-2 rounded-xl active:bg-gray-100">
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Add Member</h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="px-4 py-4 space-y-4">
        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
            {error}
          </div>
        )}

        {/* Name */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Full Name *
          </label>
          <input
            type="text"
            value={form.name}
            onChange={(e) => update('name', e.target.value)}
            className="input-field"
            placeholder="Rahul Sharma"
            required
            autoFocus
          />
        </div>

        {/* Phone */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Phone Number *
          </label>
          <input
            type="tel"
            value={form.phone}
            onChange={(e) => update('phone', e.target.value)}
            className="input-field"
            placeholder="9876543210"
            required
            pattern="[0-9]{10}"
            maxLength={10}
          />
          <p className="text-xs text-gray-400 mt-1">10-digit mobile number</p>
        </div>

        {/* Plan */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Plan *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['monthly', 'quarterly', 'annual'] as Plan[]).map((plan) => (
              <button
                key={plan}
                type="button"
                onClick={() => update('plan', plan)}
                className={`py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all text-center ${
                  form.plan === plan
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {plan === 'monthly' ? '1 Month' : plan === 'quarterly' ? '3 Months' : '1 Year'}
              </button>
            ))}
          </div>
        </div>

        {/* Start Date */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Start Date *
          </label>
          <input
            type="date"
            value={form.start_date}
            onChange={(e) => update('start_date', e.target.value)}
            className="input-field"
            required
          />
          {endDate && (
            <p className="text-xs text-brand-600 font-medium mt-1">
              ✓ Expires on: {endDate}
            </p>
          )}
        </div>

        {/* Amount */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-1.5">
            Amount Paid (₹) *
          </label>
          <input
            type="number"
            value={form.amount}
            onChange={(e) => update('amount', e.target.value)}
            className="input-field"
            placeholder="1500"
            required
            min="0"
          />
        </div>

        {/* Payment Mode */}
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Payment Mode *
          </label>
          <div className="grid grid-cols-3 gap-2">
            {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => update('payment_mode', mode)}
                className={`py-3 px-2 rounded-xl border-2 text-sm font-medium transition-all text-center capitalize ${
                  form.payment_mode === mode
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-gray-200 bg-white text-gray-600'
                }`}
              >
                {mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <div className="pt-2 pb-4">
          <button type="submit" disabled={loading} className="btn-primary">
            {loading ? 'Adding Member...' : (
              <>
                <Check className="w-5 h-5" />
                Add Member
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  )
}
