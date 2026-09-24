'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter } from 'next/navigation'
import {
  Building2, CreditCard, Sparkles,
  ChevronRight, ChevronLeft, Check, Plus, Trash2, X, Zap
} from 'lucide-react'
import usePlacesAutocomplete from 'use-places-autocomplete'
import { WelcomeTransition } from '@/components/ui/WelcomeTransition'
import { AsciiBackdrop } from '@/components/ui/AsciiBackdrop'
import UPIQRSetup from '@/components/upi/UPIQRSetup'

// --- Types --------------------------------------------------------------------

interface MembershipPlan {
  planName: string
  category: 'strength' | 'cardio' | 'both'
  duration: 'monthly' | 'quarterly' | 'annual' | 'custom'
  price: number
  joiningFee: number
  hasDiscount: boolean
  discountPercent: number
  hasFreezeOption: boolean
  customDurationMonths?: number
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

/**
 * Business Metrics, Operations, Marketing and AI Personalization used to sit between these
 * two and the payment step. All four are gone, along with their types, state, step
 * components and the copy that described them.
 *
 * They were safe to remove because nothing consumed them. Every field went into the
 * `gyms.onboarding_data` JSONB and stopped there — a repo-wide search for the keys
 * (`operations`, `marketing`, `aiPersonalization`, and the individual fields: openTime,
 * workingDays, attendanceMethod, leadSources, reminderDaysBefore, biggestChallenge, and the
 * rest) found no reader outside this file. The sidebar tips claimed otherwise, promising that
 * Operations "controls automated booking schedules and check-in window logic" and Marketing
 * "initialize[s] automated WhatsApp & payment reminder schedules". Neither was true; no code
 * read either. That is four screens of questions asked of every new gym owner for data that
 * was written once and never looked at again.
 *
 * `plans` stays because it is genuinely read — app/owner/members/new reads
 * onboarding_data.plans when adding a member. The tour system also nests under a `tour` key
 * in the same blob and is untouched by this.
 */
interface OnboardingData {
  gymDetails: GymDetailsData
  plans: MembershipPlan[]
}

// --- Constants ----------------------------------------------------------------

const STORAGE_KEY = 'gymflow_onboarding'

const DEFAULT_PLANS: MembershipPlan[] = [
  { planName: 'Monthly', category: 'both', duration: 'monthly', price: 1500, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false, customDurationMonths: 1 },
  { planName: 'Quarterly', category: 'both', duration: 'quarterly', price: 4000, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false, customDurationMonths: 3 },
  { planName: 'Annual', category: 'both', duration: 'annual', price: 10000, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false, customDurationMonths: 12 },
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
}

const STEPS = [
  { title: 'Gym Details', subtitle: 'Tell us about your gym', icon: Building2, required: true },
  { title: 'Membership Plans', subtitle: 'Set up your pricing', icon: CreditCard, required: false },
  { title: 'Payment Settings', subtitle: 'Set up UPI payments', icon: CreditCard, required: false },
]

/**
 * Index of the last step, derived rather than written as a literal.
 *
 * The removal turned up how fragile the literal was: `6` appeared in handleNext, handleSkip,
 * the Skip button's visibility test and the Next/Complete switch, and `7` appeared again in
 * the progress percentage. Five places encoding the same fact, any one of which would have
 * silently stranded the wizard — miss the percentage and the bar never fills; miss the
 * Next/Complete switch and the last step has no way to submit.
 */
const LAST_STEP = STEPS.length - 1
const COMPLETE_TIMEOUT_MS = 20_000

interface OnboardingApiResponse {
  success?: boolean
  error?: {
    code?: string
    message?: string
    retryable?: boolean
  }
  data?: { gymId?: string | null }
}

/**
 * Validate the only required setup step before letting the owner leave it, then repeat the
 * same check before the final request in case an old or hand-edited localStorage draft was
 * restored. Server validation remains authoritative; this is for immediate, useful feedback.
 */
function validateGymDetails(details: GymDetailsData): string | null {
  if (details.gymName.trim().length < 2) {
    return 'Enter a gym name with at least 2 characters.'
  }
  if (!Number.isInteger(details.branchCount) || details.branchCount < 1 || details.branchCount > 100) {
    return 'Number of branches must be between 1 and 100.'
  }
  const latestOpeningYear = new Date().getFullYear() + 1
  if (!Number.isInteger(details.openingYear) || details.openingYear < 1900 || details.openingYear > latestOpeningYear) {
    return `Opening year must be between 1900 and ${latestOpeningYear}.`
  }
  if (details.phone && !/^\d{10}$/.test(details.phone)) {
    return 'Enter a complete 10-digit phone number, or clear the phone field.'
  }
  return null
}

/**
 * Client-owned copy for operational failures. The API provides messages too, but database
 * and internal codes deliberately map to fixed text here so a future server regression can
 * never put a Supabase/Postgres message back into the page.
 */
function onboardingErrorMessage(response: Response, payload: OnboardingApiResponse | null): string {
  const code = payload?.error?.code

  if (code === 'VALIDATION_ERROR') {
    const message = payload?.error?.message
    return typeof message === 'string' && message.length <= 240
      ? message
      : 'Some setup details are invalid. Review Gym Details and try again.'
  }
  if (code === 'UNAUTHORIZED' || response.status === 401) {
    return 'Your session has expired. Sign in again, then return to setup—your details are saved on this device.'
  }
  if (code === 'RATE_LIMITED' || response.status === 429) {
    return 'Too many setup attempts. Wait a minute, then try again.'
  }
  if (code === 'GYM_NOT_FOUND' || response.status === 404) {
    return 'We could not find this gym on your account. Refresh the page and try again.'
  }
  if (code === 'PLAN_SYNC_ERROR') {
    return 'Your gym details were saved, but membership prices did not sync. Please try again.'
  }
  if (response.status >= 500) {
    return 'We could not save your setup right now. Your details are safe on this device—please try again.'
  }
  return 'We could not complete your setup. Review your details and try again.'
}

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
  const [draftReady, setDraftReady] = useState(false)

  const scrollRef = useRef<HTMLDivElement>(null)
  const errorRef = useRef<HTMLDivElement>(null)
  const submittingRef = useRef(false)

  // Restore from localStorage before autosaving. The ready flag prevents the initial
  // default render from overwriting a saved draft before this effect can restore it.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      if (saved) {
        /*
          Only the two surviving sections are restored. A draft saved before the four steps
          were removed will still have their keys in localStorage; picking just what is named
          here drops them, so a half-finished old draft cannot reintroduce fields that no
          longer have a type, a form or a reader.
        */
        const parsed = JSON.parse(saved) as Partial<OnboardingData>
        setData(prev => ({
          gymDetails: { ...prev.gymDetails, ...parsed.gymDetails },
          plans: parsed.plans ?? prev.plans,
        }))
      }
    } catch {
      // A corrupt draft cannot be restored. Remove it so later valid edits can be saved.
      // If storage itself is blocked, removeItem will throw for the same reason getItem did;
      // this effect must not take the onboarding page down with it.
      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Storage is unavailable; the API still owns durable persistence.
      }
    } finally {
      setDraftReady(true)
    }
  }, [])

  // Keep the draft — including phone — until the server confirms success. This used to
  // autosave on the initial render and had a separate "clear on unmount" effect whose
  // cleanup also ran whenever `submitting` changed. Starting a request therefore erased
  // the very draft the error message claimed was safe. Success is the only removal site.
  useEffect(() => {
    if (!draftReady || success) return
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
    } catch {
      // Storage may be disabled or full. Submission still works; the API owns persistence.
    }
  }, [data, draftReady, success])

  useEffect(() => {
    if (!error) return
    // Let React commit the alert before moving focus. Screen-reader users hear the new
    // message immediately, and keyboard users land where recovery guidance is shown.
    const frame = requestAnimationFrame(() => errorRef.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [error])

  const updateGymDetails = useCallback((patch: Partial<GymDetailsData>) => {
    setError('')
    setData(prev => ({ ...prev, gymDetails: { ...prev.gymDetails, ...patch } }))
  }, [])

  const updatePlan = useCallback((index: number, patch: Partial<MembershipPlan>) => {
    setError('')
    setData(prev => {
      const plans = [...prev.plans]
      plans[index] = { ...plans[index], ...patch }
      return { ...prev, plans }
    })
  }, [])

  const addPlan = useCallback(() => {
    setError('')
    setData(prev => ({
      ...prev,
      plans: [...prev.plans, { planName: '', category: 'both', duration: 'monthly', price: 0, joiningFee: 0, hasDiscount: false, discountPercent: 0, hasFreezeOption: false, customDurationMonths: 1 }],
    }))
  }, [])

  const removePlan = useCallback((index: number) => {
    setError('')
    setData(prev => ({ ...prev, plans: prev.plans.filter((_, i) => i !== index) }))
  }, [])

  const navigate = (nextStep: number) => {
    setError('')
    setDirection(nextStep > currentStep ? 'forward' : 'back')
    setAnimating(true)
    setTimeout(() => {
      setCurrentStep(nextStep)
      setAnimating(false)
    }, 200)
  }

  const handleNext = () => {
    if (currentStep === 0) {
      const validationError = validateGymDetails(data.gymDetails)
      if (validationError) {
        setError(validationError)
        return
      }
    }
    if (currentStep < LAST_STEP) navigate(currentStep + 1)
  }

  const handleBack = () => {
    if (currentStep > 0) navigate(currentStep - 1)
  }

  const handleSkip = () => {
    if (currentStep < LAST_STEP) navigate(currentStep + 1)
  }

  const handleComplete = async () => {
    if (submittingRef.current) return

    // Repeat client validation here because a legacy or hand-edited localStorage draft can
    // bypass the first-step Next button. Bring the owner back to the field that needs work.
    const validationError = validateGymDetails(data.gymDetails)
    if (validationError) {
      setDirection('back')
      setAnimating(false)
      setCurrentStep(0)
      setError(validationError)
      scrollRef.current?.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    submittingRef.current = true
    setSubmitting(true)
    setError('')

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), COMPLETE_TIMEOUT_MS)

    try {
      const res = await fetch('/api/onboarding/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        signal: controller.signal,
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
        }),
      })

      /*
        Do not assume an error response is JSON. A proxy, platform outage or middleware crash
        can return HTML or an empty body; calling res.json() used to throw and mislabel those
        cases as a network error. Parse defensively, then map by status/code below.
      */
      let payload: OnboardingApiResponse | null = null
      const responseText = await res.text()
      if (responseText) {
        try {
          payload = JSON.parse(responseText) as OnboardingApiResponse
        } catch {
          // The fixed client copy below is safer and more useful than showing an HTML body.
        }
      }

      if (!res.ok || !payload?.success) {
        setError(onboardingErrorMessage(res, payload))
        return
      }

      try {
        localStorage.removeItem(STORAGE_KEY)
      } catch {
        // Server persistence succeeded. A blocked storage API must not turn success into error.
      }
      setSuccess(true)

      // `?tour=welcome` starts the guided tour on arrival. Passing it explicitly makes the
      // first run deterministic rather than depending on onboarding_data being reread first.
      setTimeout(() => router.push('/owner/dashboard?tour=welcome'), 2800)
    } catch (requestError: unknown) {
      if (requestError instanceof DOMException && requestError.name === 'AbortError') {
        setError('Saving is taking longer than expected. Your details are safe on this device—please try again.')
      } else {
        setError('We could not reach the server. Check your internet connection and try again—your details are saved on this device.')
      }
    } finally {
      window.clearTimeout(timeout)
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const step = STEPS[currentStep]
  const StepIcon = step.icon
  const progressPercent = ((currentStep + 1) / STEPS.length) * 100

  if (success) {
    return (
      <WelcomeTransition
        title={
          /* Greeting at the neutral-700 floor, brand name at neutral-950 — the brand-blue
             gradient this used to carry was the last coloured text on the screen, and the
             emphasis works on weight and ink instead. Matches the default headline that
             WelcomeTransition renders when no title is passed. */
          <>
            <span className="block text-neutral-700">Welcome to</span>
            <span className="block text-neutral-950">gymflow</span>
          </>
        }
        subtitle="Setup complete! Taking you to your new dashboard..."
      />
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-slate-50 flex flex-col md:flex-row overflow-hidden">
      {/* -- Left Sidebar (Desktop Only) -- */}
      <div className="hidden md:flex md:w-72 lg:w-80 xl:w-96 bg-gradient-to-b from-slate-900 to-slate-800 text-white flex-col justify-between p-5 lg:p-6 border-r border-slate-800 flex-shrink-0 relative isolate">
        {/*
          The character grid from /auth, in reverse polarity: white ink here rather than
          black, since this panel is dark. absolute rather than the fixed used on /auth
          because it belongs to this column, not the viewport — CharGrid measures its own
          container and watches it with a ResizeObserver, so it tracks the md/lg/xl width
          steps on its own.

          isolate scopes the z-indices to this panel: the gradient paints as the element's
          own background, the canvas sits above it at z-0, and the two content blocks below
          are lifted to z-10.

          The default minWidth of 768 lines up exactly with this panel's `hidden md:flex`,
          so there is no width at which the grid mounts inside a hidden parent and pays for
          a canvas nobody sees.

          ── Why 0.12 and not the 0.26 used on /auth ──────────────────────────────────
          Same contrast-ceiling logic, different arithmetic. White ink at opacity a over
          slate-900 lifts the worst backdrop to a*255 + (1-a)*15/23/42 per channel, and the
          binding constraint is the 10px slate-400 step subtitles: they measure 7.02 on the
          bare gradient, and a full mark at 0.26 would drop them to 2.99, well under the 4.5
          floor. At 0.12 they hold 4.98. The disabled slate-500 steps land lower, but those
          are inactive controls and exempt — and they were already at 3.75 before the grid.
        */}
        <AsciiBackdrop
          className="pointer-events-none absolute inset-0 z-0 opacity-[0.12]"
          color="#ffffff"
          colorTint="#94a3b8"
          scale={4}
          intensity={1.099}
          contrast={2.501}
        />

        <div className="relative z-10 space-y-8">
          {/* Logo row */}
          <div className="flex items-center gap-2.5">
            <img src="/logo_only.png" alt="Gymflow Logo" className="w-9 h-9 object-contain" />
            <span className="text-white font-bold text-xl tracking-tight">gymflow</span>
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
        <div className="relative z-10 bg-slate-800/40 border border-slate-700/30 p-4 rounded-2xl">
          <div className="flex items-center gap-2 mb-2 text-brand-400">
            <Sparkles className="w-4 h-4 animate-pulse" />
            <span className="text-[10px] font-black uppercase tracking-wider">Quick Setup Tip</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed font-medium">
            {currentStep === 0 && "Fill in your basic gym info. This helps us customize default membership packages and tax records."}
            {currentStep === 1 && "Define plans you sell to members. You can customize discounts, admission/joining charges, and freeze options."}
            {currentStep === 2 && "Upload or scan your UPI QR code so members can pay directly via QR at the counter."}
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
                <img src="/logo_only.png" alt="Gymflow Logo" className="w-8 h-8 object-contain" />
                <span className="text-white font-bold text-lg">gymflow</span>
              </div>
              <span className="text-brand-100 text-sm font-medium">
                Step {currentStep + 1} of 7
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto bg-slate-50/50">
          <div className="max-w-3xl mx-auto px-3 xs:px-4 py-6 xs:py-8 lg:py-12">
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
                <StepPaymentSettings gymId={gymId} />
              )}
            </div>

            {error && (
              <div
                ref={errorRef}
                role="alert"
                tabIndex={-1}
                className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                <X className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden="true" />
                <span>{error}</span>
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
              {!step.required && currentStep < LAST_STEP && (
                <button onClick={handleSkip} className="btn-secondary">
                  Skip
                </button>
              )}

              {currentStep < LAST_STEP ? (
                <button onClick={handleNext} className="btn-primary">
                  Next
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <button
                  onClick={handleComplete}
                  disabled={submitting}
                  aria-busy={submitting}
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
              onChange={e => {
                const val = parseInt(e.target.value);
                onChange({ branchCount: isNaN(val) ? ('' as any) : val });
              }}
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

          <div className="grid grid-cols-3 gap-3">
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
              <label className="block text-xs font-medium text-slate-600 mb-1">Category</label>
              <select
                value={plan.category || 'both'}
                onChange={e => onUpdate(i, { category: e.target.value as MembershipPlan['category'] })}
                className="input-field"
              >
                <option value="both">Strength + Cardio</option>
                <option value="strength">Strength</option>
                <option value="cardio">Cardio</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Duration</label>
              <div className="flex gap-2">
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
                {plan.duration === 'custom' && (
                  <input
                    type="number"
                    min={1}
                    value={plan.customDurationMonths || ''}
                    onChange={e => {
                      const val = parseInt(e.target.value);
                      onUpdate(i, { customDurationMonths: isNaN(val) ? undefined : val });
                    }}
                    className="input-field w-20 px-2 text-center"
                    placeholder="Mos"
                    title="Number of months"
                  />
                )}
              </div>
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

// --- Step 3: Payment Settings (UPI QR Upload) ---------------------------------

function StepPaymentSettings({ gymId }: { gymId: string | null }) {
  return (
    <div className="space-y-4">
      <div className="card p-5 space-y-4">
        <div className="flex items-start gap-3 p-3.5 bg-blue-50 rounded-xl border border-blue-100">
          <CreditCard className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800">Set up UPI Payments</p>
            <p className="text-xs text-blue-600 mt-0.5 leading-relaxed">
              Upload or scan your merchant UPI QR code. We'll extract your UPI ID automatically so members can pay via QR at the counter.
            </p>
          </div>
        </div>

        <UPIQRSetup initialConfig={null} />

        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs text-slate-400 leading-relaxed">
            Supports all UPI apps: Google Pay, PhonePe, Paytm, BHIM, Amazon Pay, and any bank-generated QR code.
            You can always update this later from Account Settings.
          </p>
        </div>
      </div>
    </div>
  )
}
