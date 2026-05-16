'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, X, Edit2, User, Phone, MapPin, Calendar, CreditCard, IndianRupee, Hash } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcEndDate, formatDate, formatCurrency, isValidPhone } from '@/lib/utils'
import type { Plan, PaymentMode } from '@/types'
import { formatMemberId } from '@/types'
import { format } from 'date-fns'
import Link from 'next/link'
import GooglePlacesAutocomplete from '@/components/location/GooglePlacesAutocomplete'
import type { NormalizedPlaceResult } from '@/services/location/normalizeGooglePlace'

type Step = 'form' | 'preview'

// Plan prices fetched from gym_plan_prices table (set during onboarding)
interface PlanPrices {
  monthly: number
  quarterly: number
  annual: number
  joining_fee_monthly: number
  joining_fee_quarterly: number
  joining_fee_annual: number
}

export default function NewMemberPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [googleMeta, setGoogleMeta] = useState<NormalizedPlaceResult | null>(null)
  const [nextMemberNumber, setNextMemberNumber] = useState<number | null>(null)
  const [numError, setNumError] = useState('')
  const [checkingNum, setCheckingNum] = useState(false)
  const [gymId, setGymId] = useState<string | null>(null)
  const [planPrices, setPlanPrices] = useState<PlanPrices | null>(null)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    gender: '' as 'male' | 'female' | 'other' | '',
    age: '',
    area: '',
    member_number: '',
    plan: 'monthly' as Plan,
    custom_months: '',
    start_date: format(new Date(), 'yyyy-MM-dd'),
    admission_fee: '',
    amount: '',
    pending_amount: '',
    payment_mode: 'cash' as PaymentMode,
  })

  useEffect(() => {
    async function fetchInitialData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
      if (!gym) return
      setGymId(gym.id)

      // Fetch next member number
      const { data: memberData } = await supabase
        .from('members')
        .select('member_number')
        .eq('gym_id', gym.id)
        .order('member_number', { ascending: false })
        .limit(1)
      const last = memberData?.[0]?.member_number ?? 0
      setNextMemberNumber(last + 1)
      setForm(prev => ({ ...prev, member_number: String(last + 1) }))

      // Fetch plan prices set during onboarding
      const { data: prices } = await supabase
        .from('gym_plan_prices')
        .select('monthly, quarterly, annual, joining_fee_monthly, joining_fee_quarterly, joining_fee_annual')
        .eq('gym_id', gym.id)
        .single()

      if (prices) {
        setPlanPrices({
          monthly:              prices.monthly              ?? 0,
          quarterly:            prices.quarterly            ?? 0,
          annual:               prices.annual               ?? 0,
          joining_fee_monthly:  prices.joining_fee_monthly  ?? 0,
          joining_fee_quarterly:prices.joining_fee_quarterly ?? 0,
          joining_fee_annual:   prices.joining_fee_annual   ?? 0,
        })
        // Pre-fill for the default plan (monthly)
        setForm(prev => ({
          ...prev,
          amount:        prices.monthly              ? String(prices.monthly)             : prev.amount,
          admission_fee: prices.joining_fee_monthly  ? String(prices.joining_fee_monthly) : prev.admission_fee,
        }))
      }
    }
    fetchInitialData()
  }, [])

  useEffect(() => {
    const num = parseInt(form.member_number)
    if (!num || !gymId) { setNumError(form.member_number ? '' : 'Member ID is required'); return }
    setCheckingNum(true)
    setNumError('')
    const timer = setTimeout(async () => {
      const { data } = await supabase.from('members').select('id').eq('gym_id', gymId).eq('member_number', num).single()
      setNumError(data ? `${formatMemberId(num)} is already taken` : '')
      setCheckingNum(false)
    }, 400)
    return () => clearTimeout(timer)
  }, [form.member_number, gymId])

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  // When plan changes, auto-fill price and joining fee from onboarding config
  function selectPlan(plan: Plan) {
    setForm(prev => {
      const next = { ...prev, plan }
      if (planPrices && plan !== 'custom') {
        const priceMap: Record<string, number> = {
          monthly:   planPrices.monthly,
          quarterly: planPrices.quarterly,
          annual:    planPrices.annual,
        }
        const joiningMap: Record<string, number> = {
          monthly:   planPrices.joining_fee_monthly,
          quarterly: planPrices.joining_fee_quarterly,
          annual:    planPrices.joining_fee_annual,
        }
        next.amount        = priceMap[plan]   ? String(priceMap[plan])   : prev.amount
        next.admission_fee = joiningMap[plan] ? String(joiningMap[plan]) : prev.admission_fee
      }
      return next
    })
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    if (!form.member_number) { setError('Member ID is required'); return }
    if (numError) return
    setError('')
    setStep('preview')
  }

  async function handleApprove() {
    setLoading(true)
    setError('')

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not authenticated')

      const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
      if (!gym) throw new Error('Gym not found')

      const { data: existing } = await supabase
        .from('members').select('id').eq('gym_id', gym.id).eq('phone', form.phone).single()
      if (existing && form.phone.trim()) throw new Error('A member with this phone number already exists.')

      const memberNumber = parseInt(form.member_number)
      if (!memberNumber) throw new Error('Member ID is required')

      const { data: existingNum } = await supabase
        .from('members').select('id').eq('gym_id', gym.id).eq('member_number', memberNumber).single()
      if (existingNum) throw new Error(`${formatMemberId(memberNumber)} is already taken`)

      const finalMemberNumber = memberNumber

      const { data: member, error: memberError } = await supabase
        .from('members')
        .insert({
          gym_id: gym.id,
          member_number: finalMemberNumber,
          name: form.name.trim(),
          phone: form.phone.trim(),
          pending_amount: parseInt(form.pending_amount) || 0,
          ...(form.gender && { gender: form.gender }),
          ...(form.age && { age: parseInt(form.age) }),
          ...(form.area.trim() && { area: form.area.trim() }),
          // Google Places supplementary metadata (never used as canonical ID)
          ...(googleMeta && {
            google_place_id:       googleMeta.google.placeId       || null,
            google_formatted_addr: googleMeta.google.formattedAddress || null,
            google_locality_raw:   googleMeta.google.locality       || null,
            google_city_raw:       googleMeta.google.city           || null,
            google_state_raw:      googleMeta.google.state          || null,
            google_postal_code:    googleMeta.google.postalCode     || null,
            google_latitude:       googleMeta.google.latitude,
            google_longitude:      googleMeta.google.longitude,
          }),
        })
        .select()
        .single()

      if (memberError) throw memberError

      const end_date = calcEndDate(form.start_date, form.plan, form.plan === 'custom' ? parseInt(form.custom_months) || 1 : undefined)
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          member_id: member.id,
          gym_id: gym.id,
          plan: form.plan === 'custom' ? 'monthly' : form.plan,
          start_date: form.start_date,
          end_date,
          amount: parseInt(form.amount, 10) || 0,
          admission_fee: parseInt(form.admission_fee, 10) || 0,
          payment_mode: form.payment_mode,
        })

      if (membershipError) throw membershipError

      router.push('/members')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setStep('form')
      setLoading(false)
    }
  }

  const endDate = form.start_date
    ? calcEndDate(form.start_date, form.plan, form.plan === 'custom' ? parseInt(form.custom_months) || 1 : undefined)
    : null

  const admissionFee = parseInt(form.admission_fee, 10) || 0
  const membershipFee = parseInt(form.amount, 10) || 0
  const totalAmount = admissionFee + membershipFee
  const pendingAmount = parseInt(form.pending_amount, 10) || 0

  const planLabel = form.plan === 'monthly' ? '1 Month' : form.plan === 'quarterly' ? '3 Months' : form.plan === 'annual' ? '1 Year' : `${form.custom_months} Months (Custom)`

  // ── Preview Card ──────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep('form')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Edit
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Confirm Member</h1>
        </div>

        {error && (
          <div className="mb-4 p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">{error}</div>
        )}

        <div className="card overflow-hidden mb-4">
          <div className="bg-gradient-to-br from-brand-500 to-brand-600 p-5">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 bg-white/25 rounded-2xl flex items-center justify-center">
                <span className="text-white font-bold text-xl">
                  {form.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-white font-bold text-xl">{form.name}</p>
                <p className="text-white/70 text-sm mt-0.5">{formatMemberId(parseInt(form.member_number) || nextMemberNumber || 0)}</p>
              </div>
            </div>
          </div>

          <div className="p-5 space-y-3">
            <DetailRow icon={<Phone className="w-4 h-4 text-slate-400" />} label="Phone" value={form.phone} />
            {form.gender && <DetailRow icon={<User className="w-4 h-4 text-slate-400" />} label="Gender" value={form.gender.charAt(0).toUpperCase() + form.gender.slice(1)} />}
            {form.age && <DetailRow icon={<User className="w-4 h-4 text-slate-400" />} label="Age" value={`${form.age} yrs`} />}
            {form.area && <DetailRow icon={<MapPin className="w-4 h-4 text-slate-400" />} label="Area" value={form.area} />}
            <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Plan" value={planLabel} />
            <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Start Date" value={formatDate(form.start_date)} />
            {endDate && <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Expires On" value={formatDate(endDate)} />}
            <DetailRow icon={<CreditCard className="w-4 h-4 text-slate-400" />} label="Payment Mode" value={form.payment_mode.toUpperCase()} />
          </div>

          <div className="mx-5 mb-5 bg-slate-50 rounded-xl p-4 space-y-2">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-2">Payment Summary</p>
            <div className="flex justify-between text-sm">
              <span className="text-slate-500">Membership Fee</span>
              <span className="font-semibold text-slate-900">{formatCurrency(membershipFee)}</span>
            </div>
            {admissionFee > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-slate-500">Admission Fee</span>
                <span className="font-semibold text-slate-900">{formatCurrency(admissionFee)}</span>
              </div>
            )}
            <div className="flex justify-between text-sm border-t border-slate-200 pt-2">
              <span className="font-bold text-slate-700">Total Collected</span>
              <span className="font-bold text-brand-600">{formatCurrency(totalAmount)}</span>
            </div>
            {pendingAmount > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-red-500 font-medium">Pending Due</span>
                <span className="font-bold text-red-500">{formatCurrency(pendingAmount)}</span>
              </div>
            )}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <Link href="/members"
            className="flex items-center justify-center gap-2 py-3 bg-red-50 text-red-600 font-semibold text-sm rounded-2xl border border-red-200 hover:bg-red-100 transition-all"
          >
            <X className="w-4 h-4" />
            Decline
          </Link>
          <button onClick={() => setStep('form')}
            className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 font-semibold text-sm rounded-2xl hover:bg-slate-200 transition-all"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
          <button onClick={handleApprove} disabled={loading}
            className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm rounded-2xl shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-60"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Saving...' : 'Approve'}
          </button>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />
          Members
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Add Member</h1>
      </div>

      <div className="card p-4 md:p-6">
        <form onSubmit={handlePreview} className="space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-2xl text-red-700 text-sm font-medium">{error}</div>
          )}

          {/* Member ID */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              Member ID <span className="text-red-500">*</span>
            </label>
            <div className="flex items-center gap-2">
              <input type="text" value={form.member_number ? `GF${form.member_number.padStart(4, '0')}` : ''}
                onChange={(e) => {
                  const raw = e.target.value.trim().toUpperCase()
                  const digits = raw.startsWith('GF') ? raw.slice(2) : raw
                  const num = parseInt(digits, 10)
                  update('member_number', isNaN(num) ? '' : String(num))
                }}
                className={`input-field w-36 ${numError ? 'border-red-400 focus:ring-red-400' : ''}`}
                placeholder={nextMemberNumber ? formatMemberId(nextMemberNumber) : 'GF0001'} required />
              {nextMemberNumber && (
                <span className="text-xs text-slate-400">
                  Suggested: <button type="button" onClick={() => update('member_number', String(nextMemberNumber))}
                    className="text-brand-600 font-semibold hover:underline">{formatMemberId(nextMemberNumber)}</button>
                </span>
              )}
            </div>
            {checkingNum && <p className="text-xs text-slate-400 mt-1.5">Checking...</p>}
            {numError && <p className="text-xs text-red-500 mt-1.5 font-medium">⚠ {numError}</p>}
            {!numError && !checkingNum && form.member_number && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">✓ Available</p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Full Name *</label>
            <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
              className="input-field" placeholder="Rahul Sharma" required autoFocus />
          </div>

          {/* Gender + Age */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Gender</label>
              <div className="grid grid-cols-3 gap-2">
                {(['male', 'female', 'other'] as const).map((g) => (
                  <button key={g} type="button" onClick={() => update('gender', form.gender === g ? '' : g)}
                    className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all text-center ${
                      form.gender === g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {g === 'male' ? 'M' : g === 'female' ? 'F' : 'O'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Age</label>
              <input type="number" value={form.age} onChange={(e) => update('age', e.target.value)}
                className="input-field" placeholder="25" min="1" max="120" />
            </div>
          </div>

          {/* Phone */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Phone Number</label>
            <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)}
              className="input-field" placeholder="9876543210" maxLength={10} />
            {form.phone && !isValidPhone(form.phone)
              ? <p className="text-xs text-amber-600 font-medium mt-1.5">⚠️ Invalid phone number — WhatsApp reminders won't work for this member</p>
              : <p className="text-xs text-slate-400 mt-1.5">10-digit mobile number</p>
            }
          </div>

          {/* Area */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Area / Locality</label>
            <GooglePlacesAutocomplete
              value={form.area}
              gymId={gymId ?? undefined}
              onChange={(val, normalized) => {
                update('area', val)
                if (normalized) setGoogleMeta(normalized)
              }}
              onClear={() => { update('area', ''); setGoogleMeta(null) }}
            />
            {form.area && googleMeta && (
              <p className="text-xs text-emerald-600 font-medium mt-1.5 flex items-center gap-1">
                <Check className="w-3 h-3" />
                {googleMeta.confidence_score >= 0.9
                  ? `Matched: ${googleMeta.canonical_area}`
                  : `Suggested: ${googleMeta.canonical_area} — review recommended`}
              </p>
            )}
          </div>

          {/* Plan */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Plan *</label>
            <div className="grid grid-cols-4 gap-2">
              {(['monthly', 'quarterly', 'annual', 'custom'] as Plan[]).map((plan) => {
                const priceHint = planPrices && plan !== 'custom'
                  ? { monthly: planPrices.monthly, quarterly: planPrices.quarterly, annual: planPrices.annual }[plan]
                  : null
                return (
                  <button key={plan} type="button" onClick={() => selectPlan(plan)}
                    className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all text-center ${
                      form.plan === plan ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    <span className="block">{plan === 'monthly' ? '1 Month' : plan === 'quarterly' ? '3 Months' : plan === 'annual' ? '1 Year' : 'Custom'}</span>
                    {priceHint ? <span className="block text-[10px] font-normal mt-0.5 opacity-70">₹{priceHint.toLocaleString('en-IN')}</span> : null}
                  </button>
                )
              })}
            </div>
            {form.plan === 'custom' && (
              <div className="mt-2 flex items-center gap-2">
                <input type="number" min="1" max="24" value={form.custom_months}
                  onChange={(e) => update('custom_months', e.target.value)}
                  className="input-field w-28" placeholder="e.g. 2" required />
                <span className="text-sm text-slate-500 font-medium">months</span>
              </div>
            )}
          </div>

          {/* Start Date */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Start Date *</label>
            <input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)}
              className="input-field" required />
            {endDate && <p className="text-xs text-brand-600 font-semibold mt-1.5">✓ Expires on: {endDate}</p>}
          </div>

          {/* Fees */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                Admission Fee (₹) <span className="text-slate-400 font-normal">optional</span>
              </label>
              <input type="number" value={form.admission_fee} onChange={(e) => update('admission_fee', e.target.value)}
                className="input-field" placeholder="500" min="0" />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Membership Fee (₹) *</label>
              <input type="number" value={form.amount} onChange={(e) => update('amount', e.target.value)}
                className="input-field" placeholder="1500" required min="0" />
            </div>
          </div>

          {(admissionFee > 0 || membershipFee > 0) && (
            <div className="bg-brand-50 rounded-xl px-4 py-3 space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-brand-600">Membership Fee</span>
                <span className="font-semibold text-brand-700">₹{membershipFee.toLocaleString('en-IN')}</span>
              </div>
              {admissionFee > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-brand-600">Admission Fee</span>
                  <span className="font-semibold text-brand-700">₹{admissionFee.toLocaleString('en-IN')}</span>
                </div>
              )}
              <div className="flex justify-between text-sm border-t border-brand-200 pt-1.5">
                <span className="font-bold text-brand-700">Total Collected</span>
                <span className="text-base font-bold text-brand-700">₹{totalAmount.toLocaleString('en-IN')}</span>
              </div>
            </div>
          )}

          {/* Payment Mode */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Mode *</label>
            <div className="grid grid-cols-3 gap-2">
              {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
                <button key={mode} type="button" onClick={() => update('payment_mode', mode)}
                  className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all text-center ${
                    form.payment_mode === mode ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                  }`}
                >
                  {mode.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          {/* Pending Due */}
          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
              Pending Due (₹) <span className="text-slate-400 font-normal normal-case">optional</span>
            </label>
            <input type="number" value={form.pending_amount} onChange={(e) => update('pending_amount', e.target.value)}
              className="input-field" placeholder="0" min="0" />
          </div>

          <div className="pt-2">
            <button type="submit" disabled={!!numError || checkingNum || !form.member_number} className="btn-primary disabled:opacity-50">
              Review & Confirm →
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-7 h-7 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">{icon}</div>
      <div className="flex-1 flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="text-sm font-semibold text-slate-900">{value}</span>
      </div>
    </div>
  )
}
