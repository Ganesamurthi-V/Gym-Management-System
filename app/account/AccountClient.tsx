'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Copy, Lock, Trash2, AlertTriangle, Eye, EyeOff,
  Building2, Mail, Calendar, Users, CreditCard, CalendarCheck,
  ChevronLeft, Check, X, ShieldAlert, Hash, MapPin, Phone,
  Edit3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'
import Image from 'next/image'
import { invalidateGymCache, invalidateAllGymCaches } from './actions'
import { computeSubscriptionState } from '@/lib/subscription-utils'
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel'

interface Props {
  email: string
  gymId: string
  gymName: string
  gymCreatedAt: string
  memberCount: number
  membershipCount: number
  attendanceCount: number
  gymType?: string | null
  gymCity?: string | null
  gymPhone?: string | null
  gymAddress?: string | null
  openingYear?: number | null
  branchCount?: number | null
  subscriptionStatus?: string
  planType?: string | null
  trialEndsAt?: string | null
  subscriptionEndsAt?: string | null
}

type ModalType = 'gym-name' | 'gym-info' | 'password' | 'delete-data' | 'delete-gym' | null

export function AccountClient({
  email,
  gymId,
  gymName: initialGymName,
  gymCreatedAt,
  memberCount,
  membershipCount,
  attendanceCount,
  gymType,
  gymCity,
  gymPhone,
  gymAddress,
  openingYear,
  branchCount,
  subscriptionStatus = 'active',
  planType,
  trialEndsAt,
  subscriptionEndsAt,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Editable state
  const [gymName, setGymName] = useState(initialGymName)
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  // Real-time subscription state
  const [liveSubStatus, setLiveSubStatus] = useState(subscriptionStatus)
  const [livePlanType, setLivePlanType] = useState(planType)
  const [liveTrialEndsAt, setLiveTrialEndsAt] = useState(trialEndsAt)
  const [liveSubEndsAt, setLiveSubEndsAt] = useState(subscriptionEndsAt)

  const syncGymSubscription = useCallback(async () => {
    const { data: gymRow } = await supabase
      .from('gyms')
      .select('subscription_status, plan_type, trial_ends_at, subscription_ends_at')
      .eq('id', gymId)
      .single()

    if (!gymRow) return
    setLiveSubStatus(gymRow.subscription_status ?? 'active')
    setLivePlanType(gymRow.plan_type)
    setLiveTrialEndsAt(gymRow.trial_ends_at)
    setLiveSubEndsAt(gymRow.subscription_ends_at)
  }, [gymId, supabase])

  useRealtimeChannel({
    channelName: `owner_account_gym_${gymId}`,
    subscriptions: [
      {
        type: 'postgres_changes',
        filter: { event: 'UPDATE', schema: 'public', table: 'gyms', filter: `id=eq.${gymId}` },
        callback: syncGymSubscription,
      },
    ],
    onResync: syncGymSubscription,
  })

  // Gym name form
  const [newGymName, setNewGymName] = useState(initialGymName)

  // Gym info form (editable onboarding fields)
  const [gymInfo, setGymInfo] = useState({
    gymType:     gymType     ?? '',
    gymCity:     gymCity     ?? '',
    gymPhone:    gymPhone    ?? '',
    gymAddress:  gymAddress  ?? '',
    openingYear: openingYear ? String(openingYear) : '',
    branchCount: branchCount ? String(branchCount) : '1',
  })

  // Toast notification
  const [toast, setToast] = useState<{ text: string; visible: boolean }>({ text: '', visible: false })

  function showToast(text: string) {
    setToast({ text, visible: true })
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000)
  }

  // Password form
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)

  // Delete confirmation prompt
  const [deleteConfirmText, setDeleteConfirmText] = useState('')

  // Shared state
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  function openModal(type: ModalType) {
    setMessage(null)
    setDeleteConfirmText('')
    setNewGymName(gymName)
    setNewPassword('')
    setConfirmPassword('')
    // Reset gym info form to current values
    setGymInfo({
      gymType:     gymType     ?? '',
      gymCity:     gymCity     ?? '',
      gymPhone:    gymPhone    ?? '',
      gymAddress:  gymAddress  ?? '',
      openingYear: openingYear ? String(openingYear) : '',
      branchCount: branchCount ? String(branchCount) : '1',
    })
    setActiveModal(type)
  }

  function closeModal() {
    setActiveModal(null)
    setMessage(null)
    setDeleteConfirmText('')
  }

  // ── Update gym name ──────────────────────────────────────────────────────────
  async function handleUpdateGymName(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newGymName.trim()
    if (!/^[a-zA-Z0-9\s.]{2,60}$/.test(trimmed)) {
      setMessage({ type: 'error', text: 'Gym name must be 2–60 characters and contain only letters, numbers, spaces, or dots.' })
      return
    }
    setIsSaving(true)
    setMessage(null)
    const { error } = await supabase.from('gyms').update({ name: trimmed }).eq('id', gymId)
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      // Issue 3 fix: bust the 120s Redis gym cache so getGym() returns fresh data.
      await invalidateGymCache()
      setGymName(trimmed)
      setMessage({ type: 'success', text: 'Gym name updated successfully.' })
      setTimeout(() => { closeModal(); showToast('Gym name updated') }, 1200)
    }
    setIsSaving(false)
  }

  // ── Update gym info (onboarding_data patch) ──────────────────────────────────
  async function handleUpdateGymInfo(e: React.FormEvent) {
    e.preventDefault()
    setIsSaving(true)
    setMessage(null)

    // Merge new values into existing onboarding_data JSONB
    const { data: current } = await supabase
      .from('gyms')
      .select('onboarding_data')
      .eq('id', gymId)
      .single()

    const existing = (current?.onboarding_data ?? {}) as Record<string, unknown>
    const merged = {
      ...existing,
      gymType:     gymInfo.gymType     || null,
      city:        gymInfo.gymCity     || null,
      phone:       gymInfo.gymPhone    || null,
      address:     gymInfo.gymAddress  || null,
      openingYear: gymInfo.openingYear ? parseInt(gymInfo.openingYear) : null,
      branchCount: gymInfo.branchCount ? parseInt(gymInfo.branchCount) : 1,
    }

    const { error } = await supabase
      .from('gyms')
      .update({ onboarding_data: merged })
      .eq('id', gymId)

    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      // Issue 3 fix: bust the 120s Redis gym cache so getGym() returns fresh data.
      await invalidateGymCache()
      closeModal()
      showToast('Gym info saved')
      router.refresh()
    }
    setIsSaving(false)
  }

  // ── Update password ──────────────────────────────────────────────────────────
  async function handleUpdatePassword(e: React.FormEvent) {
    e.preventDefault()
    if (newPassword.length < 8 || !/\d/.test(newPassword)) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters and contain at least one number.' })
      return
    }
    if (newPassword !== confirmPassword) {
      setMessage({ type: 'error', text: 'Passwords do not match.' })
      return
    }
    setIsSaving(true)
    setMessage(null)
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    if (error) {
      setMessage({ type: 'error', text: error.message })
    } else {
      setMessage({ type: 'success', text: 'Password updated. You may need to log in again on other devices.' })
      setTimeout(() => { closeModal(); showToast('Password updated') }, 1500)
    }
    setIsSaving(false)
  }

  // ── Delete all gym data (keep login) ────────────────────────────────────────
  async function handleDeleteData() {
    if (deleteConfirmText !== gymName) {
      setMessage({ type: 'error', text: `Type the gym name exactly to confirm.` })
      return
    }
    setIsSaving(true)
    setMessage(null)
    const res = await fetch('/api/account/delete-data', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gym_id: gymId }),
    })
    const json = await res.json()
    if (!json.success) {
      setMessage({ type: 'error', text: json.error?.message ?? 'Something went wrong.' })
      setIsSaving(false)
      return
    }
    setMessage({ type: 'success', text: 'All member data deleted. Your login is intact.' })
    // Bust all gym-scoped Redis caches so dashboard and members page reflect
    // empty state immediately instead of serving stale cached data.
    await invalidateAllGymCaches(gymId)
    setTimeout(() => { closeModal(); router.refresh() }, 2000)
    setIsSaving(false)
  }

  // ── Delete entire gym account ────────────────────────────────────────────────
  async function handleDeleteGym() {
    if (deleteConfirmText !== gymName) {
      setMessage({ type: 'error', text: `Type the gym name exactly to confirm.` })
      return
    }
    setIsSaving(true)
    setMessage(null)
    const res = await fetch('/api/account/delete-gym', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ gym_id: gymId }),
    })
    const json = await res.json()
    if (!json.success) {
      setMessage({ type: 'error', text: json.error?.message ?? 'Something went wrong.' })
      setIsSaving(false)
      return
    }
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const deleteDataReady = deleteConfirmText === gymName
  const deleteGymReady  = deleteConfirmText === gymName

  const subState = computeSubscriptionState({
    subscription_status: liveSubStatus,
    plan_type: livePlanType,
    trial_ends_at: liveTrialEndsAt,
    subscription_ends_at: liveSubEndsAt,
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">

      {/* ── Toast notification ── */}
      <div className={`fixed bottom-6 right-6 z-[70] transition-all duration-300 ${
        toast.visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
      }`}>
        <div className="flex items-center gap-2.5 bg-slate-900 text-white text-sm font-semibold px-4 py-3 rounded-2xl shadow-xl">
          <div className="w-5 h-5 bg-emerald-500 rounded-full flex items-center justify-center flex-shrink-0">
            <Check className="w-3 h-3 text-white" />
          </div>
          {toast.text}
        </div>
      </div>
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-500 hover:bg-slate-50 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-slate-900">Account Settings</h1>
          <p className="text-sm text-slate-400 mt-0.5">Manage your gym profile and account</p>
        </div>
      </div>

      {/* Gym Info Card */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gym Profile</p>

        <div className="flex items-start gap-4">
          <Image src="/logo.png" alt="Logo" width={56} height={56} className="rounded-2xl object-contain flex-shrink-0 shadow-sm border border-slate-100" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 group cursor-pointer w-fit" onClick={() => openModal('gym-name')}>
              <h2 className="text-lg font-bold text-slate-900 truncate">{gymName}</h2>
              <div className="w-6 h-6 rounded-md flex items-center justify-center text-slate-300 hover:bg-slate-100 hover:text-brand-600 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                <Edit3 className="w-3.5 h-3.5" />
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-sm text-slate-500">Member since {formatDate(gymCreatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Read-only info fields */}
        <div className="space-y-3 pt-1">
          <ReadOnlyField
            icon={<Mail className="w-3.5 h-3.5 text-slate-400" />}
            label="Login Email"
            value={email}
            note="Contact admin to change your email"
          />
          <ReadOnlyField
            icon={<Hash className="w-3.5 h-3.5 text-slate-400" />}
            label="Gym ID"
            value={gymId}
            mono
            note="Contact admin to change your Gym ID"
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Members</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{memberCount}</p>
          </div>
          <div className="text-center border-x border-slate-100">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Payments</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{membershipCount}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">Check-ins</span>
            </div>
            <p className="text-xl font-bold text-slate-900">{attendanceCount}</p>
          </div>
        </div>

        {/* Onboarding details */}
        <div className="pt-3 border-t border-slate-100 space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Gym Info</p>
            <button
              onClick={() => openModal('gym-info')}
              className="flex items-center gap-1.5 text-xs font-semibold text-brand-600 hover:text-brand-700 transition-colors"
            >
              <Edit3 className="w-3.5 h-3.5" />
              Edit
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(gymType || gymInfo.gymType) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Type</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.gymType || gymType || '—'}</p>
              </div>
            )}
            {(gymCity || gymInfo.gymCity) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">City</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.gymCity || gymCity || '—'}</p>
              </div>
            )}
            {(gymPhone || gymInfo.gymPhone) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Phone</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.gymPhone || gymPhone || '—'}</p>
              </div>
            )}
            {(openingYear || gymInfo.openingYear) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Est.</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.openingYear || openingYear || '—'}</p>
              </div>
            )}
            {(Number(gymInfo.branchCount) > 1 || (branchCount && branchCount > 1)) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Branches</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.branchCount || branchCount || '—'}</p>
              </div>
            )}
            {(gymAddress || gymInfo.gymAddress) && (
              <div className="bg-slate-50 rounded-xl px-3 py-2 sm:col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Address</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{gymInfo.gymAddress || gymAddress || '—'}</p>
              </div>
            )}
            {/* Show edit prompt if no info yet */}
            {!gymType && !gymCity && !gymPhone && !gymAddress && !openingYear && !gymInfo.gymType && !gymInfo.gymCity && (
              <div className="sm:col-span-2 text-center py-4">
                <p className="text-sm text-slate-400">No gym info added yet.</p>
                <button onClick={() => openModal('gym-info')}
                  className="text-sm text-brand-600 font-semibold hover:underline mt-1">
                  Add gym details →
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Subscription Details Card */}
      <div className="card relative overflow-hidden border-brand-200">
        <div className="absolute inset-0 bg-gradient-to-br from-brand-50/80 via-white to-brand-50/30 pointer-events-none" />
        <div className="relative p-5 space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-brand-100 rounded-lg flex items-center justify-center">
              <CreditCard className="w-4 h-4 text-brand-600" />
            </div>
            <p className="text-xs font-bold text-brand-600 uppercase tracking-widest">Subscription Details</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="bg-white rounded-xl px-4 py-3 border border-brand-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Plan</p>
              <p className="text-sm font-semibold text-slate-800 mt-0.5 capitalize">{livePlanType || 'Default'}</p>
            </div>
            <div className="bg-white rounded-xl px-4 py-3 border border-brand-100 shadow-sm">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Status</p>
              <div className="flex items-center justify-between mt-0.5">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                    subState.status === 'active' ? 'bg-emerald-500' :
                    subState.status === 'trial' ? 'bg-blue-500' :
                    subState.status === 'expiring' ? 'bg-amber-500' :
                    'bg-red-500'
                  }`} />
                  <p className="text-sm font-semibold text-slate-800 capitalize truncate">{subState.status}</p>
                </div>
                {subState.daysLeft !== null && subState.daysLeft > 0 && (
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${
                    subState.isExpiringSoon ? 'bg-amber-100 text-amber-700' : 'bg-brand-100 text-brand-700'
                  }`}>
                    {subState.daysLeft} days left
                  </span>
                )}
                {subState.isExpired && (
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-red-100 text-red-700 flex-shrink-0">
                    Expired
                  </span>
                )}
              </div>
            </div>
            {liveTrialEndsAt && (
              <div className="bg-white rounded-xl px-4 py-3 border border-brand-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Trial Ends At</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(liveTrialEndsAt)}</p>
              </div>
            )}
            {liveSubEndsAt && (
              <div className="bg-white rounded-xl px-4 py-3 border border-brand-100 shadow-sm">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Next Billing</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">{formatDate(liveSubEndsAt)}</p>
              </div>
            )}
            {!liveTrialEndsAt && !liveSubEndsAt && (
              <div className="bg-white rounded-xl px-4 py-3 border border-brand-100 shadow-sm sm:col-span-2">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Access</p>
                <p className="text-sm font-semibold text-slate-800 mt-0.5">Lifetime (Never Expires)</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Settings Actions */}
      <div className="card divide-y divide-slate-100 overflow-hidden">
        <p className="px-5 pt-4 pb-2 text-xs font-bold text-slate-400 uppercase tracking-widest">Settings</p>

        <button
          onClick={() => openModal('gym-info')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
              <MapPin className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-800">Edit Gym Info</p>
              <p className="text-xs text-slate-400 mt-0.5">Type, city, phone, address, year</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 group-hover:text-slate-500 transition-colors" />
        </button>

        <button
          onClick={() => openModal('gym-name')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-slate-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Settings className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-800">Edit Gym Name</p>
              <p className="text-xs text-slate-400 mt-0.5">Currently: {gymName}</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 group-hover:text-slate-500 transition-colors" />
        </button>

        <button
          onClick={() => subscriptionStatus === 'trial' ? undefined : openModal('password')}
          disabled={subscriptionStatus === 'trial'}
          title={subscriptionStatus === 'trial' ? 'Password changes are not allowed during the free trial period' : undefined}
          className={`w-full flex items-center justify-between px-5 py-4 transition-colors group ${
            subscriptionStatus === 'trial'
              ? 'opacity-60 cursor-not-allowed bg-slate-50'
              : 'hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-800">Change Password</p>
              {subscriptionStatus === 'trial' ? (
                <p className="text-xs text-amber-600 mt-0.5 font-medium">🔒 Not available during free trial</p>
              ) : (
                <p className="text-xs text-slate-400 mt-0.5">Update your login password</p>
              )}
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-slate-300 rotate-180 group-hover:text-slate-500 transition-colors" />
        </button>
      </div>

      {/* Danger Zone */}
      <div className="card border-red-200 overflow-hidden">
        <div className="px-5 pt-4 pb-2 bg-red-50 border-b border-red-100">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            <p className="text-xs font-bold text-red-600 uppercase tracking-widest">Danger Zone</p>
          </div>
        </div>

        <div className="divide-y divide-red-50">
          {/* Delete data only */}
          <div className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-orange-50 rounded-xl flex items-center justify-center text-orange-600 flex-shrink-0 mt-0.5">
                <Trash2 className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Delete All Member Data</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Permanently removes all members, payments, and attendance records.
                  Your gym login and account will remain active.
                </p>
              </div>
            </div>
            <button
              onClick={() => openModal('delete-data')}
              className="flex-shrink-0 px-3.5 py-2 text-xs font-bold text-orange-700 bg-orange-50 border border-orange-200 rounded-xl hover:bg-orange-100 transition-all whitespace-nowrap"
            >
              Delete Data
            </button>
          </div>

          {/* Delete entire gym */}
          <div className="px-5 py-4 flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 bg-red-50 rounded-xl flex items-center justify-center text-red-600 flex-shrink-0 mt-0.5">
                <AlertTriangle className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800">Delete Entire Gym Account</p>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  Permanently deletes everything — all data AND your login account.
                  This cannot be undone.
                </p>
              </div>
            </div>
            <button
              onClick={() => openModal('delete-gym')}
              className="flex-shrink-0 px-3.5 py-2 text-xs font-bold text-red-700 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 transition-all whitespace-nowrap"
            >
              Delete All
            </button>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}

      {/* Edit Gym Info Modal */}
      {activeModal === 'gym-info' && (
        <Modal title="Edit Gym Info" onClose={closeModal}>
          <form onSubmit={handleUpdateGymInfo} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Gym Type</label>
                <select
                  value={gymInfo.gymType}
                  onChange={e => setGymInfo(p => ({ ...p, gymType: e.target.value }))}
                  className="input-field"
                >
                  <option value="">Select type</option>
                  {['Gym', 'Fitness Center', 'CrossFit', 'Yoga Studio', 'Martial Arts', 'Other'].map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">City</label>
                <input
                  type="text"
                  value={gymInfo.gymCity}
                  onChange={e => setGymInfo(p => ({ ...p, gymCity: e.target.value }))}
                  className="input-field"
                  placeholder="e.g. Chennai"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Phone</label>
                <input
                  type="tel"
                  value={gymInfo.gymPhone}
                  onChange={e => setGymInfo(p => ({ ...p, gymPhone: e.target.value.replace(/\D/g, '').slice(0, 10) }))}
                  className="input-field"
                  placeholder="10-digit number"
                  maxLength={10}
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Opening Year</label>
                <input
                  type="number"
                  value={gymInfo.openingYear}
                  onChange={e => setGymInfo(p => ({ ...p, openingYear: e.target.value }))}
                  className="input-field"
                  placeholder={String(new Date().getFullYear())}
                  min={1950}
                  max={new Date().getFullYear()}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Number of Branches</label>
              <input
                type="number"
                value={gymInfo.branchCount}
                onChange={e => setGymInfo(p => ({ ...p, branchCount: e.target.value }))}
                className="input-field"
                placeholder="1"
                min={1}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">Address</label>
              <textarea
                value={gymInfo.gymAddress}
                onChange={e => setGymInfo(p => ({ ...p, gymAddress: e.target.value }))}
                className="input-field resize-none"
                rows={3}
                placeholder="Full gym address..."
              />
            </div>

            <MessageBanner message={message} />
            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Edit Gym Name Modal */}
      {activeModal === 'gym-name' && (
        <Modal title="Edit Gym Name" onClose={closeModal}>
          <form onSubmit={handleUpdateGymName} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Gym Name
              </label>
              <input
                type="text"
                value={newGymName}
                onChange={(e) => setNewGymName(e.target.value)}
                className="input-field"
                placeholder="Enter gym name"
                required
                autoFocus
              />
              <p className="text-xs text-slate-400 mt-1.5">2–60 characters, letters, numbers, spaces, or dots only.</p>
            </div>
            <MessageBanner message={message} />
            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Change Password Modal */}
      {activeModal === 'password' && (
        <Modal title="Change Password" onClose={closeModal}>
          <form onSubmit={handleUpdatePassword} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="input-field pr-10"
                  placeholder="Min 8 chars, 1 number"
                  required
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">
                Confirm New Password
              </label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                placeholder="Confirm password"
                required
              />
            </div>
            <MessageBanner message={message} />
            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? 'Updating…' : 'Update Password'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Delete Data Modal */}
      {activeModal === 'delete-data' && (
        <Modal title="Delete All Member Data" onClose={closeModal} danger>
          <div className="space-y-4">
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-orange-800 space-y-1">
                <p className="font-bold">This will permanently delete:</p>
                <ul className="list-disc list-inside space-y-0.5 text-orange-700">
                  <li>All {memberCount} member profiles</li>
                  <li>All {membershipCount} payment records</li>
                  <li>All {attendanceCount} attendance check-ins</li>
                  <li>All area and geo data</li>
                </ul>
                <p className="font-semibold mt-2">Your gym login will remain active.</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Type <span className="text-orange-600 font-mono">{gymName}</span> to confirm
                </label>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(gymName); showToast('Copied to clipboard') }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="input-field"
                placeholder={gymName}
                autoFocus
              />
            </div>

            <MessageBanner message={message} />

            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button
                onClick={handleDeleteData}
                disabled={isSaving || !deleteDataReady}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-orange-500 hover:bg-orange-600 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                {isSaving ? 'Deleting…' : 'Delete All Data'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Delete Entire Gym Modal */}
      {activeModal === 'delete-gym' && (
        <Modal title="Delete Entire Gym Account" onClose={closeModal} danger>
          <div className="space-y-4">
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-800 space-y-1">
                <p className="font-bold">This will permanently delete EVERYTHING:</p>
                <ul className="list-disc list-inside space-y-0.5 text-red-700">
                  <li>All {memberCount} member profiles</li>
                  <li>All {membershipCount} payment records</li>
                  <li>All {attendanceCount} attendance check-ins</li>
                  <li>Your gym profile and settings</li>
                  <li>Your login account</li>
                </ul>
                <p className="font-bold mt-2 text-red-900">You will be logged out and cannot recover this data.</p>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider">
                  Type <span className="text-red-600 font-mono">{gymName}</span> to confirm
                </label>
                <button
                  type="button"
                  onClick={() => { navigator.clipboard.writeText(gymName); showToast('Copied to clipboard') }}
                  className="text-xs text-brand-600 hover:text-brand-700 font-semibold flex items-center gap-1"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </button>
              </div>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                className="input-field"
                placeholder={gymName}
                autoFocus
              />
            </div>

            <MessageBanner message={message} />

            <div className="flex gap-2">
              <button type="button" onClick={closeModal} className="btn-secondary">Cancel</button>
              <button
                onClick={handleDeleteGym}
                disabled={isSaving || !deleteGymReady}
                className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-red-600 hover:bg-red-700 text-white font-semibold rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed text-sm"
              >
                {isSaving ? 'Deleting…' : 'Delete Everything'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Shared sub-components ────────────────────────────────────────────────────

function Modal({
  title,
  children,
  onClose,
  danger = false,
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  danger?: boolean
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-pop-in shadow-2xl">
        <div className={`flex items-center justify-between px-5 py-4 border-b ${danger ? 'border-red-100 bg-red-50' : 'border-slate-100'}`}>
          <h3 className={`font-bold ${danger ? 'text-red-800' : 'text-slate-900'}`}>{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

function MessageBanner({ message }: { message: { type: 'success' | 'error'; text: string } | null }) {
  if (!message) return null
  return (
    <div className={`flex items-start gap-2.5 text-sm p-3 rounded-xl font-medium ${
      message.type === 'success'
        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
        : 'bg-red-50 text-red-700 border border-red-100'
    }`}>
      {message.type === 'success'
        ? <Check className="w-4 h-4 flex-shrink-0 mt-0.5" />
        : <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />}
      {message.text}
    </div>
  )
}

function ReadOnlyField({
  icon,
  label,
  value,
  note,
  mono = false,
}: {
  icon: React.ReactNode
  label: string
  value: string
  note: string
  mono?: boolean
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-sm text-slate-700 break-all ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-slate-300 flex-shrink-0" />
        {note}
      </p>
    </div>
  )
}
