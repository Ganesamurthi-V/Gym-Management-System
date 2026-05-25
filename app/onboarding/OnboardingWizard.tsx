'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Dumbbell, Building2, CreditCard, BarChart2, Settings, Megaphone, Sparkles,
  ChevronRight, ChevronLeft, Check, Plus, Trash2, X, Clock, Users, TrendingUp, Zap
} from 'lucide-react'
import usePlacesAutocomplete from 'use-places-autocomplete'
import { useLenisScroll } from '@/lib/hooks/useLenisScroll'

// --- Types --------------------------------------------------------------------

interface MembershipPlan {
  planName: string
  duration: 'monthly' | 'quarterly' | 'annual' | 'custom'
  price: number
  joiningFee: number
  hasDiscount: boolean
  discountPercent: number
  hasFreezeOption: boolean
}

interface GymDetailsData {
  gymName: string
  gymType: string
  branchCount: number
  address: string
  openingYear: number
  phone: string
  city: string
}

interface BusinessMetricsData {
  activeMembers: number
  monthlyJoins: number
  cancellations: number
  trainersCount: number
  monthlyRevenue: number
  monthlyExpenses: number
}

interface OperationsData {
  openTime: string
  closeTime: string
  workingDays: string[]
  attendanceMethod: string
  existingSoftware: string
  wantsToImportData: boolean
  hasSplitShift?: boolean
  openTime2?: string
  closeTime2?: string
}

interface MarketingData {
  leadSources: string[]
  whatsappMarketing: boolean
  instagramLink: string
  paymentReminders: boolean
  renewalReminders: boolean
  reminderDaysBefore: number
}

interface AIPersonalizationData {
  biggestChallenge: string
  mainGoal: string
  additionalNotes: string
}

interface OnboardingData {
  gymDetails: GymDetailsData
  plans: MembershipPlan[]
  metrics: BusinessMetricsData
  operations: OperationsData
  marketing: MarketingData
  aiPersonalization: AIPersonalizationData
}

// --- Constants ----------------------------------------------------------------

const STORAGE_KEY = 'GymDesk_onboarding'

const DEFAULT_PLANS: MembershipPlan[] = [
  { planName: 'Monthly', duration: 'monthly', price: 1500, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false },
  { planName: 'Quarterly', duration: 'quarterly', price: 4000, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false },
  { planName: 'Annual', duration: 'annual', price: 10000, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false },
]

const DEFAULT_DATA: OnboardingData = {
  gymDetails: {
    gymName: '',
    gymType: 'Gym',
    branchCount: 1,
    address: '',
    openingYear: new Date().getFullYear(),
    phone: '',
    city: '',
  },
  plans: DEFAULT_PLANS,
  metrics: {
    activeMembers: 0,
    monthlyJoins: 0,
    cancellations: 0,
    trainersCount: 0,
    monthlyRevenue: 0,
    monthlyExpenses: 0,
  },
  operations: {
    openTime: '06:00',
    closeTime: '12:00',
    workingDays: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
    attendanceMethod: 'Manual',
    existingSoftware: '',
    wantsToImportData: false,
    hasSplitShift: false,
    openTime2: '16:00',
    closeTime2: '21:00',
  },
  marketing: {
    leadSources: [],
    whatsappMarketing: false,
    instagramLink: '',
    paymentReminders: true,
    renewalReminders: true,
    reminderDaysBefore: 7,
  },
  aiPersonalization: {
    biggestChallenge: '',
    mainGoal: '',
    additionalNotes: '',
  },
}

const STEPS = [
  { title: 'Gym Details', subtitle: 'Tell us about your gym', icon: Building2, required: true },
  { title: 'Membership Plans', subtitle: 'Set up your pricing', icon: CreditCard, required: false },
  { title: 'Business Metrics', subtitle: 'Current performance', icon: BarChart2, required: false },
  { title: 'Operations', subtitle: 'How you run your gym', icon: Settings, required: false },
  { title: 'Marketing', subtitle: 'Grow your member base', icon: Megaphone, required: false },
  { title: 'AI Personalization', subtitle: 'Customize your experience', icon: Sparkles, required: false },
]

const WORKING_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const LEAD_SOURCES = ['Walk-in', 'Instagram', 'Facebook', 'WhatsApp', 'Referral', 'Google', 'Other']

// --- Props --------------------------------------------------------------------

interface OnboardingWizardProps {
  gymId: string | null
  gymName: string
}

// --- Component ----------------------------------------------------------------

export function OnboardingWizard({ gymId, gymName }: OnboardingWizardProps) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [data, setData] = useState<OnboardingData>(() => {
    const base = { ...DEFAULT_DATA }
    if (gymName) base.gymDetails.gymName = gymName
    return base
  })
  const [animating, setAnimating] = useState(false)
  const [direction, setDirection] = useState<'forward' | 'back'>('forward')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  const scrollRef = useRef<HTMLDivElement>(null)
  useLenisScroll(scrollRef, [currentStep])

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<OnboardingData>
        setData(prev => ({
          gymDetails: { ...prev.gymDetails, ...parsed.gymDetails },
          plans: parsed.plans ?? prev.plans,
          metrics: { ...prev.metrics, ...parsed.metrics },
          operations: { ...prev.operations, ...parsed.operations },
          marketing: { ...prev.marketing, ...parsed.marketing },
          aiPersonalization: { ...prev.aiPersonalization, ...parsed.aiPersonalization },
        }))
      }
    } catch {
      // ignore corrupt storage
    }
  }, [])

  // Autosave to localStorage on every data change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // ignore storage errors
    }
  }, [data])

  const updateGymDetails = useCallback((patch: Partial<GymDetailsData>) => {
    setData(prev => ({ ...prev, gymDetails: { ...prev.gymDetails, ...patch } }))
  }, [])

  const updateMetrics = useCallback((patch: Partial<BusinessMetricsData>) => {
    setData(prev => ({ ...prev, metrics: { ...prev.metrics, ...patch } }))
  }, [])

  const updateOperations = useCallback((patch: Partial<OperationsData>) => {
    setData(prev => ({ ...prev, operations: { ...prev.operations, ...patch } }))
  }, [])

  const updateMarketing = useCallback((patch: Partial<MarketingData>) => {
    setData(prev => ({ ...prev, marketing: { ...prev.marketing, ...patch } }))
  }, [])

  const updateAI = useCallback((patch: Partial<AIPersonalizationData>) => {
    setData(prev => ({ ...prev, aiPersonalization: { ...prev.aiPersonalization, ...patch } }))
  }, [])

  const updatePlan = useCallback((index: number, patch: Partial<MembershipPlan>) => {
    setData(prev => {
      const plans = [...prev.plans]
      plans[index] = { ...plans[index], ...patch }
      return { ...prev, plans }
    })
  }, [])

  const addPlan = useCallback(() => {
    setData(prev => ({
      ...prev,
      plans: [...prev.plans, { planName: '', duration: 'monthly', price: 0, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false }],
    }))
  }, [])

  const removePlan = useCallback((index: number) => {
    setData(prev => ({ ...prev, plans: prev.plans.filter((_, i) => i !== index) }))
  }, [])

  const navigate = (nextStep: number) => {
    setDirection(nextStep > currentStep ? 'forward' : 'back')
    setAnimating(true)
    setTimeout(() => {
      setCurrentStep(nextStep)
      setAnimating(false)
    }, 200)
  }

  const handleNext = () => {
    if (currentStep < 5) navigate(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) navigate(currentStep - 1)
  }

  const handleSkip = () => {
    if (currentStep < 5) navigate(currentStep + 1)
  }

  const handleComplete = async () => {
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gymId,
          gymName: data.gymDetails.gymName,
          gymType: data.gymDetails.gymType,
          branchCount: data.gymDetails.branchCount,
          address: data.gymDetails.address,
          openingYear: data.gymDetails.openingYear,
          phone: data.gymDetails.phone,
          city: data.gymDetails.city,
          plans: data.plans,
          metrics: data.metrics,
          operations: data.operations,
          marketing: data.marketing,
          aiPersonalization: data.aiPersonalization,
        }),
      })
      const json = await res.json()
      if (!res.ok || !json.success) {
        setError(json.error?.message ?? 'Something went wrong. Please try again.')
        setSubmitting(false)
        return
      }
      localStorage.removeItem(STORAGE_KEY)
      setSuccess(true)
      setTimeout(() => router.push('/dashboard'), 1800)
    } catch {
      setError('Network error. Please check your connection and try again.')
      setSubmitting(false)
    }
  }

  const step = STEPS[currentStep]
  const StepIcon = step.icon
  const progressPercent = ((currentStep + 1) / 6) * 100

  if (success) {
    return (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
        <div className="text-center animate-pop-in">
          <div className="w-24 h-24 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-6">
            <Check className="w-12 h-12 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-white mb-2">You&apos;re all set!</h2>
          <p className="text-brand-100 text-lg">Taking you to your dashboard...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col md:flex-row overflow-hidden">
      {/* -- Left Sidebar (Desktop Only) -- */}
      <div className="hidden md:flex md:w-80 lg:w-96 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex-col justify-between p-6 border-r border-slate-800 flex-shrink-0">
        <div className="space-y-8">
          {/* Logo row */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-brand-500/20 rounded-xl flex items-center justify-center border border-brand-500/30">
              <Dumbbell className="w-5 h-5 text-brand-400" />
            </div>
            <span className="text-white font-bold text-xl tracking-tight">GymDesk</span>
          </div>

          {/* Stepper container */}
          <div className="space-y-6">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest">Onboarding Progress</h3>
            <div className="space-y-4">
              {STEPS.map((s, i) => {
                const Icon = s.icon
                const done = i < currentStep
                const active = i === currentStep
                return (
                  <button
                    key={i}
                    onClick={() => i <= currentStep && navigate(i)}
                    disabled={i > currentStep}
                    className={`w-full flex items-center gap-3.5 text-left p-2.5 rounded-xl transition-all ${
                      active
                        ? 'bg-white/10 text-white border border-white/10 shadow-xs'
                        : done
                        ? 'text-emerald-400 hover:bg-white/5 cursor-pointer'
                        : 'text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    <div
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                        done
                          ? 'bg-emerald-500/20 border border-emerald-500/30'
                          : active
                          ? 'bg-brand-500 text-white shadow-xs shadow-brand-500/30'
                          : 'bg-slate-800 text-slate-600'
                      }`}
                    >
                      {done ? (
                        <Check className="w-4 h-4 text-emerald-400" />
                      ) : (
                        <Icon className="w-4 h-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-xs font-bold ${active ? 'text-white' : done ? 'text-slate-300' : 'text-slate-500'}`}>
                        {s.title}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium truncate mt-0.5">{s.subtitle}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* Tip panel / Footer */}
        <div className="bg-slate-800/40 border border-slate-700/30 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2 text-brand-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-wider">Quick Setup Tip</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            {currentStep === 0 && "Fill in your basic gym info. This helps us customize default membership packages and tax records."}
            {currentStep === 1 && "Define plans you sell to members. You can customize discounts, admission/joining charges, and freeze options."}
            {currentStep === 2 && "Enter your current monthly indicators to initialize your operational dashboard metrics and forecasts."}
            {currentStep === 3 && "Configure daily operating times. This controls automated booking schedules and check-in window logic."}
            {currentStep === 4 && "Configure lead generation fields. These details initialize automated WhatsApp & payment reminder schedules."}
            {currentStep === 5 && "Identify key optimization issues to let our AI personalize your dashboard action list recommendations."}
          </p>
        </div>
      </div>

      {/* -- Right Workspace -- */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* -- Mobile Header (Hidden on Desktop) -- */}
        <div className="md:hidden bg-gradient-to-r from-brand-500 to-brand-600 px-4 pt-safe-top flex-shrink-0">
          <div className="max-w-2xl mx-auto">
            {/* Logo row */}
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 bg-white/20 rounded-xl flex items-center justify-center">
                  <Dumbbell className="w-4 h-4 text-white" />
                </div>
                <span className="text-white font-bold text-lg">GymDesk</span>
              </div>
              <span className="text-brand-100 text-sm font-medium">
                Step {currentStep + 1} of 6
              </span>
            </div>

            {/* Progress bar */}
            <div className="pb-4">
              <div className="h-1.5 bg-white/20 rounded-full overflow-hidden">
                <div
                  className="h-full bg-white rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>
          </div>
        </div>

        {/* -- Content Workspace -- */}
        <div ref={scrollRef} className="flex-1 overflow-hidden bg-slate-50/50">
          <div className="max-w-3xl mx-auto px-4 py-8 lg:py-12">
            {/* Step header */}
            <div
              className={`mb-6 transition-all duration-200 ${
                animating
                  ? direction === 'forward'
                    ? 'opacity-0 translate-x-4'
                    : 'opacity-0 -translate-x-4'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              <div className="flex items-center gap-3 mb-1">
                <div className="w-10 h-10 bg-brand-50 rounded-xl flex items-center justify-center">
                  <StepIcon className="w-5 h-5 text-brand-600" />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-900">{step.title}</h1>
                  <p className="text-sm text-slate-500">{step.subtitle}</p>
                </div>
                {!step.required && (
                  <span className="ml-auto text-xs bg-slate-100 text-slate-500 px-2.5 py-1 rounded-full font-medium">
                    Optional
                  </span>
                )}
              </div>
            </div>

            {/* Step form */}
            <div
              className={`transition-all duration-200 ${
                animating
                  ? direction === 'forward'
                    ? 'opacity-0 translate-x-4'
                    : 'opacity-0 -translate-x-4'
                  : 'opacity-100 translate-x-0'
              }`}
            >
              {currentStep === 0 && (
                <StepGymDetails data={data.gymDetails} onChange={updateGymDetails} />
              )}
              {currentStep === 1 && (
                <StepMembershipPlans plans={data.plans} onUpdate={updatePlan} onAdd={addPlan} onRemove={removePlan} />
              )}
              {currentStep === 2 && (
                <StepBusinessMetrics data={data.metrics} onChange={updateMetrics} />
              )}
              {currentStep === 3 && (
                <StepOperations data={data.operations} onChange={updateOperations} />
              )}
              {currentStep === 4 && (
                <StepMarketing data={data.marketing} onChange={updateMarketing} />
              )}
              {currentStep === 5 && (
                <StepAIPersonalization data={data.aiPersonalization} onChange={updateAI} />
              )}
            </div>

            {error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm flex items-start gap-2">
                <X className="w-4 h-4 mt-0.5 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>
        </div>

        {/* -- Navigation -- */}
        <div className="flex-shrink-0 bg-white border-t border-slate-200 px-4 py-4 pb-safe-bottom">
          <div className="max-w-3xl mx-auto flex items-center gap-3">
            {currentStep > 0 ? (
              <button onClick={handleBack} className="btn-secondary w-auto px-5">
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <div className="w-auto px-5" />
            )}

            <div className="flex-1 flex gap-3">
              {!step.required && currentStep < 5 && (
                <button onClick={handleSkip} className="btn-secondary">
                  Skip
                </button>
              )}

              {currentStep < 5 ? (
                <button onClick={handleNext} className="btn-primary">
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  className="btn-primary"
                >
                  {submitting ? (
                    <>
                      <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Zap className="w-4 h-4" />
                      Complete Setup
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// --- Step 1: Gym Details ------------------------------------------------------

function StepGymDetails({ data, onChange }: { data: GymDetailsData; onChange: (p: Partial<GymDetailsData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">
            Gym Name <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={data.gymName}
            onChange={e => onChange({ gymName: e.target.value })}
            className="input-field"
            placeholder="e.g. Iron Paradise Gym"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Gym Type</label>
          <select
            value={data.gymType}
            onChange={e => onChange({ gymType: e.target.value })}
            className="input-field"
          >
            {['Gym', 'Fitness Center', 'CrossFit', 'Yoga Studio', 'Martial Arts', 'Other'].map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Number of Branches</label>
            <input
              type="number"
              min={1}
              value={data.branchCount}
              onChange={e => onChange({ branchCount: parseInt(e.target.value) || 1 })}
              className="input-field"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Opening Year</label>
            <input
              type="number"
              min={1950}
              max={new Date().getFullYear()}
              value={data.openingYear}
              onChange={e => onChange({ openingYear: parseInt(e.target.value) || new Date().getFullYear() })}
              className="input-field"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">City</label>
            <CityAutocomplete
              value={data.city}
              onChange={(val) => onChange({ city: val })}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Phone</label>
            <input
              type="tel"
              value={data.phone}
              onChange={e => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10)
                onChange({ phone: digits })
              }}
              className="input-field"
              placeholder="10-digit number"
              maxLength={10}
            />
            {data.phone && data.phone.length > 0 && data.phone.length < 10 && (
              <p className="text-xs text-amber-600 mt-1">{10 - data.phone.length} more digits needed</p>
            )}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Address</label>
          <textarea
            value={data.address}
            onChange={e => onChange({ address: e.target.value })}
            className="input-field resize-none"
            rows={3}
            placeholder="Full gym address..."
          />
        </div>
      </div>
    </div>
  )
}

function CityAutocomplete({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const [isLoaded, setIsLoaded] = useState(false)

  useEffect(() => {
    if ((window as any).google?.maps?.places) {
      setIsLoaded(true)
      return
    }
    
    // Check if script is already injected by another component
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const checkInterval = setInterval(() => {
        if ((window as any).google?.maps?.places) {
          setIsLoaded(true)
          clearInterval(checkInterval)
        }
      }, 100)
      return () => clearInterval(checkInterval)
    }

    const script = document.createElement('script')
    script.src = `https://maps.googleapis.com/maps/api/js?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&libraries=places`
    script.async = true
    script.defer = true
    script.onload = () => setIsLoaded(true)
    document.head.appendChild(script)
  }, [])

  if (!isLoaded) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input-field"
        placeholder="e.g. Chennai"
      />
    )
  }

  return <CityAutocompleteInner value={value} onChange={onChange} />
}

function CityAutocompleteInner({ value, onChange }: { value: string; onChange: (val: string) => void }) {
  const {
    ready,
    value: inputValue,
    suggestions: { status, data },
    setValue,
    clearSuggestions,
  } = usePlacesAutocomplete({
    requestOptions: {
      types: ['(cities)'],
    },
    defaultValue: value,
    debounce: 300,
  })

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    setValue(e.target.value)
    onChange(e.target.value)
  }

  const handleSelect = (description: string) => () => {
    setValue(description, false)
    clearSuggestions()
    onChange(description)
  }

  return (
    <div className="relative">
      <input
        type="text"
        value={inputValue}
        onChange={handleInput}
        disabled={!ready}
        className="input-field"
        placeholder="e.g. Chennai"
      />
      {status === 'OK' && (
        <ul className="absolute z-10 w-full bg-white mt-1 rounded-xl shadow-lg border border-slate-200 overflow-hidden max-h-60 overflow-y-auto">
          {data.map(({ place_id, description }) => (
            <li
              key={place_id}
              onClick={handleSelect(description)}
              className="px-4 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer transition-colors"
            >
              {description}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// --- Step 2: Membership Plans -------------------------------------------------

function StepMembershipPlans({
  plans,
  onUpdate,
  onAdd,
  onRemove,
}: {
  plans: MembershipPlan[]
  onUpdate: (i: number, p: Partial<MembershipPlan>) => void
  onAdd: () => void
  onRemove: (i: number) => void
}) {
  return (
    <div className="space-y-3">
      {plans.map((plan, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">Plan {i + 1}</span>
            {plans.length > 1 && (
              <button
                onClick={() => onRemove(i)}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-red-400 hover:bg-red-50 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Plan Name</label>
              <input
                type="text"
                value={plan.planName}
                onChange={e => onUpdate(i, { planName: e.target.value })}
                className="input-field"
                placeholder="e.g. Monthly"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
              <select
                value={plan.duration}
                onChange={e => onUpdate(i, { duration: e.target.value as MembershipPlan['duration'] })}
                className="input-field"
              >
                <option value="monthly">Monthly</option>
                <option value="quarterly">Quarterly</option>
                <option value="annual">Annual</option>
                <option value="custom">Custom</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Price (?)</label>
              <input
                type="number"
                min={0}
                value={plan.price === 0 ? '' : plan.price}
                onChange={e => onUpdate(i, { price: parseInt(e.target.value) || 0 })}
                className="input-field"
                placeholder="0"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Joining Fee (?)</label>
              <input
                type="number"
                min={0}
                value={plan.joiningFee === 0 ? '' : plan.joiningFee}
                onChange={e => onUpdate(i, { joiningFee: parseInt(e.target.value) || 0 })}
                className="input-field"
                placeholder="0"
              />
            </div>
          </div>

          <div className="flex items-center gap-4 pt-1">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={plan.hasDiscount}
                onChange={e => onUpdate(i, { hasDiscount: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-xs text-slate-600">Has Discount</span>
            </label>
            {plan.hasDiscount && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={plan.discountPercent}
                  onChange={e => onUpdate(i, { discountPercent: parseInt(e.target.value) || 0 })}
                  className="input-field w-20 text-center"
                  placeholder="0"
                />
                <span className="text-xs text-slate-500">%</span>
              </div>
            )}
            <label className="flex items-center gap-2 cursor-pointer ml-auto">
              <input
                type="checkbox"
                checked={plan.hasFreezeOption}
                onChange={e => onUpdate(i, { hasFreezeOption: e.target.checked })}
                className="w-4 h-4 rounded accent-brand-500"
              />
              <span className="text-xs text-slate-600">Freeze Option</span>
            </label>
          </div>
        </div>
      ))}

      <button
        onClick={onAdd}
        className="btn-secondary"
      >
        <Plus className="w-4 h-4" />
        Add Plan
      </button>
    </div>
  )
}

// --- Step 3: Business Metrics -------------------------------------------------

function StepBusinessMetrics({ data, onChange }: { data: BusinessMetricsData; onChange: (p: Partial<BusinessMetricsData>) => void }) {
  const fields: { key: keyof BusinessMetricsData; label: string; icon: React.ReactNode; prefix?: string }[] = [
    { key: 'activeMembers', label: 'Active Members', icon: <Users className="w-4 h-4 text-brand-500" /> },
    { key: 'monthlyJoins', label: 'Monthly New Joins', icon: <TrendingUp className="w-4 h-4 text-emerald-500" /> },
    { key: 'cancellations', label: 'Monthly Cancellations', icon: <X className="w-4 h-4 text-red-400" /> },
    { key: 'trainersCount', label: 'Number of Trainers', icon: <Dumbbell className="w-4 h-4 text-purple-500" /> },
    { key: 'monthlyRevenue', label: 'Monthly Revenue', icon: <BarChart2 className="w-4 h-4 text-blue-500" />, prefix: '?' },
    { key: 'monthlyExpenses', label: 'Monthly Expenses', icon: <BarChart2 className="w-4 h-4 text-orange-400" />, prefix: '?' },
  ]

  return (
    <div className="card p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {fields.map(f => (
          <div key={f.key}>
            <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
              {f.icon}
              {f.label}
            </label>
            <div className="relative">
              {f.prefix && (
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm">{f.prefix}</span>
              )}
              <input
                type="number"
                min={0}
                value={data[f.key] === 0 ? '' : data[f.key]}
                onChange={e => onChange({ [f.key]: parseInt(e.target.value) || 0 } as Partial<BusinessMetricsData>)}
                className={`input-field ${f.prefix ? 'pl-7' : ''}`}
                placeholder="0"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// --- Step 4: Operations -------------------------------------------------------

function StepOperations({ data, onChange }: { data: OperationsData; onChange: (p: Partial<OperationsData>) => void }) {
  const toggleDay = (day: string) => {
    const days = data.workingDays.includes(day)
      ? data.workingDays.filter(d => d !== day)
      : [...data.workingDays, day]
    onChange({ workingDays: days })
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between py-1 border-b border-slate-100 pb-3">
            <div>
              <p className="text-sm font-medium text-slate-700">Split Timings / Mid-day Break</p>
              <p className="text-xs text-slate-500">Open morning & evening, closed in-between</p>
            </div>
            <button
              type="button"
              onClick={() => onChange({ hasSplitShift: !data.hasSplitShift })}
              className={`relative w-11 h-6 rounded-full transition-colors ${
                data.hasSplitShift ? 'bg-brand-500' : 'bg-slate-200'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                  data.hasSplitShift ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {!data.hasSplitShift ? (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                  <Clock className="w-4 h-4 text-brand-500" />
                  Opening Time
                </label>
                <input
                  type="time"
                  value={data.openTime}
                  onChange={e => onChange({ openTime: e.target.value })}
                  className="input-field"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-sm font-medium text-slate-700 mb-1.5">
                  <Clock className="w-4 h-4 text-slate-400" />
                  Closing Time
                </label>
                <input
                  type="time"
                  value={data.closeTime}
                  onChange={e => onChange({ closeTime: e.target.value })}
                  className="input-field"
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift 1 (Morning)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Open</label>
                    <input
                      type="time"
                      value={data.openTime}
                      onChange={e => onChange({ openTime: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Close</label>
                    <input
                      type="time"
                      value={data.closeTime}
                      onChange={e => onChange({ closeTime: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>

              <div className="bg-slate-50/50 p-3.5 rounded-xl border border-slate-100 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Shift 2 (Evening)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Open</label>
                    <input
                      type="time"
                      value={data.openTime2 || '16:00'}
                      onChange={e => onChange({ openTime2: e.target.value })}
                      className="input-field"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">Close</label>
                    <input
                      type="time"
                      value={data.closeTime2 || '21:00'}
                      onChange={e => onChange({ closeTime2: e.target.value })}
                      className="input-field"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Working Days</label>
          <div className="flex flex-wrap gap-2">
            {WORKING_DAYS.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  data.workingDays.includes(day)
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {day}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Attendance Method</label>
          <select
            value={data.attendanceMethod}
            onChange={e => onChange({ attendanceMethod: e.target.value })}
            className="input-field"
          >
            {['Manual', 'Biometric', 'App', 'Card'].map(m => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Existing Software (if any)</label>
          <input
            type="text"
            value={data.existingSoftware}
            onChange={e => onChange({ existingSoftware: e.target.value })}
            className="input-field"
            placeholder="e.g. Excel, Gymmaster, None"
          />
        </div>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-slate-700">Import Existing Data</p>
            <p className="text-xs text-slate-500">Migrate members from your old system</p>
          </div>
          <button
            type="button"
            onClick={() => onChange({ wantsToImportData: !data.wantsToImportData })}
            className={`relative w-11 h-6 rounded-full transition-colors ${
              data.wantsToImportData ? 'bg-brand-500' : 'bg-slate-200'
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                data.wantsToImportData ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  )
}

// --- Step 5: Marketing --------------------------------------------------------

function StepMarketing({ data, onChange }: { data: MarketingData; onChange: (p: Partial<MarketingData>) => void }) {
  const toggleSource = (source: string) => {
    const sources = data.leadSources.includes(source)
      ? data.leadSources.filter(s => s !== source)
      : [...data.leadSources, source]
    onChange({ leadSources: sources })
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Lead Sources</label>
          <div className="flex flex-wrap gap-2">
            {LEAD_SOURCES.map(source => (
              <button
                key={source}
                type="button"
                onClick={() => toggleSource(source)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                  data.leadSources.includes(source)
                    ? 'bg-brand-500 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {source}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Instagram Profile Link</label>
          <input
            type="text"
            value={data.instagramLink}
            onChange={e => onChange({ instagramLink: e.target.value })}
            className="input-field"
            placeholder="https://instagram.com/yourgym"
          />
        </div>

        <div className="space-y-3 pt-1">
          {[
            { key: 'whatsappMarketing' as const, label: 'WhatsApp Marketing', desc: 'Send promotions via WhatsApp' },
            { key: 'paymentReminders' as const, label: 'Payment Reminders', desc: 'Remind members about pending dues' },
            { key: 'renewalReminders' as const, label: 'Renewal Reminders', desc: 'Alert members before membership expires' },
          ].map(item => (
            <div key={item.key} className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-700">{item.label}</p>
                <p className="text-xs text-slate-500">{item.desc}</p>
              </div>
              <button
                type="button"
                onClick={() => onChange({ [item.key]: !data[item.key] } as Partial<MarketingData>)}
                className={`relative w-11 h-6 rounded-full transition-colors ${
                  data[item.key] ? 'bg-brand-500' : 'bg-slate-200'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    data[item.key] ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        {data.renewalReminders && (
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1.5">Remind Days Before Expiry</label>
            <input
              type="number"
              min={1}
              max={30}
              value={data.reminderDaysBefore}
              onChange={e => onChange({ reminderDaysBefore: parseInt(e.target.value) || 7 })}
              className="input-field"
            />
          </div>
        )}
      </div>
    </div>
  )
}

// --- Step 6: AI Personalization -----------------------------------------------

function StepAIPersonalization({ data, onChange }: { data: AIPersonalizationData; onChange: (p: Partial<AIPersonalizationData>) => void }) {
  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-4">
        <div className="flex items-start gap-3 p-3 bg-brand-50 rounded-xl border border-brand-100">
          <Sparkles className="w-5 h-5 text-brand-500 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-brand-700">
            Help us personalize your GymDesk experience. We&apos;ll tailor insights and recommendations based on your goals.
          </p>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Biggest Challenge</label>
          <select
            value={data.biggestChallenge}
            onChange={e => onChange({ biggestChallenge: e.target.value })}
            className="input-field"
          >
            <option value="">Select a challenge...</option>
            {['Member Retention', 'Revenue Growth', 'Attendance Tracking', 'Staff Management', 'Marketing', 'Other'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Main Goal</label>
          <select
            value={data.mainGoal}
            onChange={e => onChange({ mainGoal: e.target.value })}
            className="input-field"
          >
            <option value="">Select your goal...</option>
            {['Grow to 500 members', 'Increase revenue 2x', 'Automate operations', 'Improve retention', 'Launch new branch', 'Other'].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1.5">Additional Notes</label>
          <textarea
            value={data.additionalNotes}
            onChange={e => onChange({ additionalNotes: e.target.value })}
            className="input-field resize-none"
            rows={4}
            placeholder="Anything else you'd like us to know about your gym or goals..."
          />
        </div>
      </div>
    </div>
  )
}
