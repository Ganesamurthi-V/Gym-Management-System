'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, X, Edit2, User, Phone, MapPin, Calendar, CreditCard, IndianRupee, Hash, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calcEndDate, formatDate, formatCurrency, isValidPhone } from '@/lib/utils'
import type { Plan, PaymentMode } from '@/types'
import { formatMemberId } from '@/types'
import { format } from 'date-fns'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { invalidateGymCache } from '@/app/account/actions'
import UPIPaymentModal from '@/components/upi/UPIPaymentModal'

type Step = 'personal' | 'membership' | 'preview'

interface MembershipPlan {
  planName: string
  category: 'strength' | 'cardio' | 'both'
  duration: 'monthly' | 'quarterly' | 'annual' | 'custom'
  price: number
  joiningFee: number
  customDurationMonths?: number
}

export default function NewMemberPage() {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('personal')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [nextMemberNumber, setNextMemberNumber] = useState<number | null>(null)
  const [numError, setNumError] = useState('')
  const [checkingNum, setCheckingNum] = useState(false)
  const [gymId, setGymId] = useState<string | null>(null)
  // Issue C fix: cache onboarding_data in state so handleSaveNewPlan never needs a gyms re-fetch.
  const [gymOnboardingData, setGymOnboardingData] = useState<Record<string, any>>({})
  const [gymPlans, setGymPlans] = useState<MembershipPlan[]>([])
  const [showPlanModal, setShowPlanModal] = useState(false)
  const [newPlan, setNewPlan] = useState<MembershipPlan>({
    planName: 'Custom', category: 'both', duration: 'monthly', price: 1500, joiningFee: 0
  })

  // UPI payment modal state
  const [showUPIModal, setShowUPIModal] = useState(false)
  const [upiConfig, setUpiConfig] = useState<{ upi_id: string; merchant_name: string; merchant_code?: string | null; currency?: string } | null>(null)

  const [form, setForm] = useState({
    name: '',
    phone: '',
    gender: '' as 'male' | 'female' | 'other' | '',
    age: '',
    date_of_birth: '',
    area: '',
    member_number: '',
    plan: 'monthly' as Plan,
    category: 'both' as 'strength' | 'cardio' | 'both',
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
      const { data: gym } = await supabase.from('gyms').select('id, onboarding_data').eq('owner_id', user.id).single()
      if (!gym) return
      setGymId(gym.id)
      // Issue C fix: store the full onboarding_data object so handleSaveNewPlan can use it directly.
      setGymOnboardingData((gym.onboarding_data as Record<string, any>) ?? {})

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

      // Fetch plans from onboarding_data
      const plans = (gym.onboarding_data as any)?.plans || []
      setGymPlans(plans)

      // Fetch UPI config for the payment modal
      const { data: upiData } = await supabase
        .from('gym_upi_config')
        .select('upi_id, merchant_name, merchant_code, currency')
        .eq('gym_id', gym.id)
        .maybeSingle()
      if (upiData) setUpiConfig(upiData)

      const defaultPlan = plans.find((p: MembershipPlan) => p.duration === 'monthly' && p.category === 'both') 
                       || plans.find((p: MembershipPlan) => p.duration === 'monthly')
      if (defaultPlan) {
        setForm(prev => ({
          ...prev,
          amount: String(defaultPlan.price),
          admission_fee: String(defaultPlan.joiningFee),
          category: defaultPlan.category || 'both',
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
    setForm(prev => {
      const next = { ...prev, [field]: value }
      if (field === 'plan' || field === 'category') {
        const matched = gymPlans.find(p => p.duration === next.plan && (p.category || 'both') === next.category)
        if (matched) {
          next.amount = String(matched.price)
          next.admission_fee = String(matched.joiningFee)
        }
      }
      return next
    })
  }

  // When plan changes, auto-fill price and joining fee from onboarding config
  function selectPlan(plan: Plan) {
    update('plan', plan)
  }

  function handleNextStep(e: React.FormEvent) {
    e.preventDefault()
    if (!form.member_number) { setError('Member ID is required'); return }
    if (numError || checkingNum) return
    if (!form.phone.trim()) { setError('Phone Number is required'); return }
    if (!form.name.trim()) { setError('Full Name is required'); return }
    setError('')
    setStep('membership')
  }

  function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    if (!form.amount) { setError('Membership Fee is required'); return }
    setError('')

    // If UPI is selected, show the UPI payment modal instead of going to preview
    if (form.payment_mode === 'upi') {
      setShowUPIModal(true)
      return
    }

    setStep('preview')
  }

  async function handleApprove() {
    if (!gymId) { setError('Gym data not loaded. Please wait and try again.'); return }
    setLoading(true)
    setError('')

    try {
      const memberNumber = parseInt(form.member_number)
      if (!memberNumber) throw new Error('Member ID is required')

      // Note: the redundant pre-insert duplicate-check SELECT was removed. The
      // debounced availability check already runs while typing, and the DB's
      // (gym_id, member_number) unique constraint is the authoritative guard —
      // a duplicate now surfaces as a 23505 error handled below. This removes a
      // full network round trip from the critical save path.
      const { data: member, error: memberError } = await supabase
        .from('members')
        .insert({
          gym_id: gymId,
          member_number: memberNumber,
          name: form.name.trim(),
          phone: form.phone.trim(),
          pending_amount: parseInt(form.pending_amount) || 0,
          ...(form.gender && { gender: form.gender }),
          ...(form.age && { age: parseInt(form.age) }),
          ...(form.date_of_birth && { date_of_birth: form.date_of_birth }),
          ...(form.area.trim() && { area: form.area.trim() }),
        })
        .select('id')
        .single()

      if (memberError) {
        // Unique-constraint violation → member number already taken.
        if (memberError.code === '23505') {
          throw new Error(`${formatMemberId(memberNumber)} is already taken`)
        }
        throw memberError
      }

      const end_date = calcEndDate(form.start_date, form.plan, form.plan === 'custom' ? parseInt(form.custom_months) || 1 : undefined)
      const { error: membershipError } = await supabase
        .from('memberships')
        .insert({
          member_id: member.id,
          gym_id: gymId,
          plan: form.plan,
          category: form.category,
          start_date: form.start_date,
          end_date,
          amount: parseInt(form.amount, 10) || 0,
          admission_fee: parseInt(form.admission_fee, 10) || 0,
          due_amount: parseInt(form.pending_amount, 10) || 0,
          payment_mode: form.payment_mode,
        })

      if (membershipError) throw membershipError

      // Auto-send welcome WhatsApp message (fire-and-forget, non-blocking).
      // gymName is resolved server-side by the route, so no blocking SELECT here.
      if (form.phone && form.phone.replace(/\D/g, '').length >= 10) {
        fetch('/api/whatsapp/automation/welcome', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            gymId,
            memberId: member.id,
            memberName: form.name.trim(),
            phone: form.phone.trim(),
            plan: form.plan,
            startDate: form.start_date,
          }),
        }).catch(() => {}) // fire-and-forget
      }

      // Bust caches (parallel + JWT-local auth) then navigate. Awaited so the
      // /members re-render below serves fresh data.
      const { invalidateMembersCache } = await import('../actions')
      await invalidateMembersCache(gymId)

      toast.success('Member added successfully!')
      router.push('/members')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Something went wrong')
      setStep('personal')
      setLoading(false)
    }
  }

  async function handleSaveNewPlan(e: React.FormEvent) {
    e.preventDefault()
    if (!gymId) return
    const updatedPlans = [...gymPlans, newPlan]
    
    // Update local state
    setGymPlans(updatedPlans)
    
    // Auto-select the newly added plan
    setForm(prev => ({
      ...prev,
      plan: newPlan.duration as Plan,
      category: newPlan.category,
      amount: String(newPlan.price),
      admission_fee: String(newPlan.joiningFee)
    }))

    setShowPlanModal(false)
    toast.success('Plan added successfully!')

    // Issue C fix: use gymOnboardingData already in state — no SELECT needed.
    // Spread to avoid mutating state directly, then merge the updated plans array.
    const merged = { ...gymOnboardingData, plans: updatedPlans }
    await supabase.from('gyms').update({ onboarding_data: merged }).eq('id', gymId)

    // Issue 3 fix: bust the 120s Redis gym cache so getGym() returns fresh onboarding_data.
    await invalidateGymCache()

    // Keep local cache in sync so a second plan save in the same session
    // doesn't overwrite merged with the stale original object.
    setGymOnboardingData(merged)
  }

  const endDate = form.start_date
    ? calcEndDate(form.start_date, form.plan, form.plan === 'custom' ? parseInt(form.custom_months) || 1 : undefined)
    : null

  const admissionFee = parseInt(form.admission_fee, 10) || 0
  const membershipFee = parseInt(form.amount, 10) || 0
  const pendingAmount = parseInt(form.pending_amount, 10) || 0
  const totalAmount = admissionFee + membershipFee - pendingAmount

  const planLabel = form.plan === 'monthly' ? '1 Month' : form.plan === 'quarterly' ? '3 Months' : form.plan === 'annual' ? '1 Year' : `${form.custom_months} Months (Custom)`

  // ── Preview Card ──────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep('personal')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
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
            {form.date_of_birth && <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Date of Birth" value={formatDate(form.date_of_birth)} />}
            {form.area && <DetailRow icon={<MapPin className="w-4 h-4 text-slate-400" />} label="Area" value={form.area} />}
            <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Plan" value={planLabel} />
            <DetailRow icon={<Calendar className="w-4 h-4 text-slate-400" />} label="Category" value={form.category === 'both' ? 'Strength + Cardio' : form.category.charAt(0).toUpperCase() + form.category.slice(1)} />
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
          <button onClick={() => setStep('personal')}
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
    <div className="max-w-3xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Members
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Add Member</h1>
        </div>

        {/* Progress Dots */}
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${step === 'personal' ? 'bg-brand-500 w-4' : 'bg-brand-500'} transition-all`} />
          <div className={`w-2 h-2 rounded-full ${step === 'membership' ? 'bg-brand-500 w-4' : 'bg-slate-200'} transition-all`} />
        </div>
      </div>

      <div className="card p-6 md:p-8">
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
        )}

        {/* ── Step 1: Personal Details ── */}
        {step === 'personal' && (
          <form onSubmit={handleNextStep} className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 border-b pb-2 mb-6">Personal Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Member ID */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Member ID <span className="text-red-500">*</span>
                </label>
                <div className="flex flex-col gap-1.5">
                  <input type="text" value={form.member_number ? `GF${form.member_number.padStart(4, '0')}` : ''}
                    onChange={(e) => {
                      const raw = e.target.value.trim().toUpperCase()
                      const digits = raw.startsWith('GF') ? raw.slice(2) : raw
                      const num = parseInt(digits, 10)
                      update('member_number', isNaN(num) ? '' : String(num))
                    }}
                    className={`input-field w-full ${numError ? 'border-red-400 focus:ring-red-400' : ''}`}
                    placeholder={nextMemberNumber ? formatMemberId(nextMemberNumber) : 'GF0001'} required />
                  <div className="flex items-center justify-between text-xs">
                    {nextMemberNumber && (
                      <span className="text-slate-400">
                        Sugg: <button type="button" onClick={() => update('member_number', String(nextMemberNumber))}
                          className="text-brand-600 font-semibold hover:underline">{formatMemberId(nextMemberNumber)}</button>
                      </span>
                    )}
                    {checkingNum && <span className="text-slate-400">Checking...</span>}
                    {numError && <span className="text-red-500 font-medium">⚠ {numError}</span>}
                    {!numError && !checkingNum && form.member_number && (
                      <span className="text-emerald-600 font-medium">✓ Available</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Phone Number *</label>
                <input type="tel" value={form.phone} onChange={(e) => update('phone', e.target.value)}
                  className="input-field" placeholder="9876543210" maxLength={10} required />
                {form.phone && !isValidPhone(form.phone) && (
                  <p className="text-xs text-amber-600 font-medium mt-1.5 leading-tight">⚠️ Invalid number</p>
                )}
              </div>

              {/* Name */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Full Name *</label>
                <input type="text" value={form.name} onChange={(e) => update('name', e.target.value)}
                  className="input-field" placeholder="Rahul Sharma" required autoFocus />
              </div>

              {/* Gender */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Gender</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['male', 'female', 'other'] as const).map((g) => (
                    <button key={g} type="button" onClick={() => update('gender', form.gender === g ? '' : g)}
                      className={`py-2.5 px-1 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
                        form.gender === g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {g === 'male' ? 'Male' : g === 'female' ? 'Female' : 'Other'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Age */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Age</label>
                <input type="number" value={form.age} onChange={(e) => update('age', e.target.value)}
                  className="input-field" placeholder="25" min="1" max="120" />
              </div>

              {/* Date of Birth */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Date of Birth <span className="text-slate-400 normal-case font-medium">(for birthday wishes)</span>
                </label>
                <input type="date" value={form.date_of_birth} onChange={(e) => update('date_of_birth', e.target.value)}
                  className="input-field" max={format(new Date(), 'yyyy-MM-dd')} />
              </div>

              {/* Area */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Area / Locality</label>
                <input
                  type="text"
                  value={form.area}
                  onChange={(e) => update('area', e.target.value)}
                  className="input-field"
                  placeholder="e.g. Anna Nagar, T. Nagar"
                />
              </div>
            </div>

            <div className="pt-6">
              <button type="submit" disabled={!!numError || checkingNum || !form.member_number} className="btn-primary w-full py-3.5 text-base shadow-lg shadow-brand-500/20 disabled:opacity-50 disabled:shadow-none">
                Next: Membership Details →
              </button>
            </div>
          </form>
        )}

        {/* ── Step 2: Membership Details ── */}
        {step === 'membership' && (
          <form onSubmit={handlePreview} className="space-y-6">
            <h2 className="text-lg font-bold text-slate-800 border-b pb-2 mb-6">Membership Details</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Plan */}
              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide">Plan *</label>
                  <button type="button" onClick={() => setShowPlanModal(true)} className="text-xs font-bold text-brand-600 flex items-center gap-1 hover:text-brand-700">
                    <Plus className="w-3 h-3" /> Add Plan
                  </button>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {(['monthly', 'quarterly', 'annual', 'custom'] as Plan[]).map((plan) => {
                    const matchedPlan = gymPlans.find(p => p.duration === plan && (p.category || 'both') === form.category)
                    const priceHint = matchedPlan ? matchedPlan.price : null
                    return (
                      <button key={plan} type="button" onClick={() => selectPlan(plan)}
                        className={`py-2.5 px-1 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
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
                  <div className="mt-2.5 flex items-center gap-2">
                    <input type="number" min="1" max="24" value={form.custom_months || ''}
                      onChange={(e) => {
                        const val = e.target.value.replace(/\D/g, '');
                        update('custom_months', val);
                      }}
                      className="input-field w-32" placeholder="e.g. 2" required />
                    <span className="text-sm text-slate-500 font-medium">months</span>
                  </div>
                )}
              </div>

              {/* Category */}
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['strength', 'cardio', 'both'] as const).map((cat) => (
                    <button key={cat} type="button" onClick={() => update('category', cat)}
                      className={`py-2 px-1 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
                        form.category === cat ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {cat === 'both' ? 'Strength + Cardio' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Start Date *</label>
                <input type="date" value={form.start_date} onChange={(e) => update('start_date', e.target.value)}
                  className="input-field" required />
                {endDate && <p className="text-xs text-brand-600 font-semibold mt-1.5">✓ Exp: {endDate}</p>}
              </div>
              
              {/* Payment Mode */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Payment Mode *</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['cash', 'upi', 'card'] as PaymentMode[]).map((mode) => (
                    <button key={mode} type="button" onClick={() => update('payment_mode', mode)}
                      className={`py-2 px-1 rounded-xl border-2 text-sm font-semibold transition-all text-center ${
                        form.payment_mode === mode ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                      }`}
                    >
                      {mode.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              {/* Fees Row */}
              <div className="md:col-span-2 grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Adm Fee <span className="text-slate-400 font-normal">opt</span>
                  </label>
                  <input type="number" value={form.admission_fee} onChange={(e) => update('admission_fee', e.target.value)}
                    className="input-field" placeholder="500" min="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Mem Fee *</label>
                  <input type="number" value={form.amount} onChange={(e) => update('amount', e.target.value)}
                    className="input-field" placeholder="1500" required min="0" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                    Pending <span className="text-slate-400 font-normal">opt</span>
                  </label>
                  <input type="number" value={form.pending_amount} onChange={(e) => update('pending_amount', e.target.value)}
                    className="input-field" placeholder="0" min="0" />
                </div>
              </div>

              {/* Payment Summary */}
              {(admissionFee > 0 || membershipFee > 0) && (
                <div className="md:col-span-2 bg-brand-50 rounded-xl px-5 py-4 space-y-2">
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
                  <div className="flex justify-between text-base border-t border-brand-200 pt-2 mt-2">
                    <span className="font-bold text-brand-700">Total Collected</span>
                    <span className="font-bold text-brand-700">₹{totalAmount.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-6 flex gap-3">
              <button type="button" onClick={() => setStep('personal')} className="px-6 py-3.5 rounded-xl border-2 border-slate-200 font-semibold text-slate-600 hover:bg-slate-50 transition-colors">
                ← Back
              </button>
              <button type="submit" className="btn-primary flex-1 py-3.5 text-base shadow-lg shadow-brand-500/20">
                Review & Confirm →
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Add Plan Modal */}
      {showPlanModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-800">Add New Plan</h3>
              <button onClick={() => setShowPlanModal(false)} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-500 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveNewPlan} className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category</label>
                <select value={newPlan.category} onChange={e => setNewPlan(p => ({ ...p, category: e.target.value as any }))} className="input-field py-3">
                  <option value="both">Strength + Cardio</option>
                  <option value="strength">Strength</option>
                  <option value="cardio">Cardio</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Duration</label>
                <select value={newPlan.duration} onChange={e => setNewPlan(p => ({ ...p, duration: e.target.value as any, planName: e.target.value === 'monthly' ? 'Monthly' : e.target.value === 'quarterly' ? 'Quarterly' : e.target.value === 'annual' ? 'Annual' : 'Custom' }))} className="input-field py-3">
                  <option value="monthly">1 Month (Monthly)</option>
                  <option value="quarterly">3 Months (Quarterly)</option>
                  <option value="annual">1 Year (Annual)</option>
                  <option value="custom">Custom Duration</option>
                </select>
              </div>
              {newPlan.duration === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Number of Months</label>
                  <input type="number" value={newPlan.customDurationMonths || ''} onChange={e => setNewPlan(p => ({ ...p, customDurationMonths: Number(e.target.value) }))} className="input-field py-3" min="1" max="24" placeholder="e.g. 6" required />
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Membership Fee (₹)</label>
                  <input type="number" value={newPlan.price === 0 ? '' : newPlan.price} onChange={e => setNewPlan(p => ({ ...p, price: Number(e.target.value) }))} className="input-field py-3" required min="1" placeholder="e.g. 1500" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Admission Fee (₹)</label>
                  <input type="number" value={newPlan.joiningFee === 0 ? '' : newPlan.joiningFee} onChange={e => setNewPlan(p => ({ ...p, joiningFee: Number(e.target.value) }))} className="input-field py-3" min="0" placeholder="e.g. 500" />
                </div>
              </div>
              <div className="pt-2">
                <button type="submit" className="btn-primary w-full py-3.5 shadow-md shadow-brand-500/20">Save Plan</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* UPI Payment Modal */}
      <UPIPaymentModal
        open={showUPIModal}
        onClose={() => setShowUPIModal(false)}
        onCollectManually={() => {
          setShowUPIModal(false)
          setStep('preview')
        }}
        merchantConfig={upiConfig}
        amount={totalAmount}
        memberName={form.name.trim()}
      />

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
