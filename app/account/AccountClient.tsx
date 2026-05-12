'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Settings, Lock, Trash2, AlertTriangle, Eye, EyeOff,
  Building2, Mail, Calendar, Users, CreditCard, CalendarCheck,
  ChevronLeft, Check, X, ShieldAlert, Hash,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { formatDate } from '@/lib/utils'

interface Props {
  email: string
  gymId: string
  gymName: string
  gymCreatedAt: string
  memberCount: number
  membershipCount: number
  attendanceCount: number
}

type ModalType = 'gym-name' | 'password' | 'delete-data' | 'delete-gym' | null

export function AccountClient({
  email,
  gymId,
  gymName: initialGymName,
  gymCreatedAt,
  memberCount,
  membershipCount,
  attendanceCount,
}: Props) {
  const router = useRouter()
  const supabase = createClient()

  // Editable state
  const [gymName, setGymName] = useState(initialGymName)
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  // Gym name form
  const [newGymName, setNewGymName] = useState(initialGymName)

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
      setGymName(trimmed)
      setMessage({ type: 'success', text: 'Gym name updated successfully.' })
      setTimeout(closeModal, 1500)
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
      setTimeout(closeModal, 2000)
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

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-xl bg-white border border-gray-200 text-gray-500 hover:bg-gray-50 transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-gray-900">Account Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage your gym profile and account</p>
        </div>
      </div>

      {/* Gym Info Card */}
      <div className="card p-5 space-y-4">
        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">Gym Profile</p>

        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-gradient-to-br from-brand-500 to-brand-600 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-sm">
            <Building2 className="w-7 h-7 text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-bold text-gray-900 truncate">{gymName}</h2>
            <div className="flex items-center gap-1.5 mt-1">
              <Calendar className="w-3.5 h-3.5 text-gray-400" />
              <span className="text-sm text-gray-500">Member since {formatDate(gymCreatedAt)}</span>
            </div>
          </div>
        </div>

        {/* Read-only info fields */}
        <div className="space-y-3 pt-1">
          <ReadOnlyField
            icon={<Mail className="w-3.5 h-3.5 text-gray-400" />}
            label="Login Email"
            value={email}
            note="Contact admin to change your email"
          />
          <ReadOnlyField
            icon={<Hash className="w-3.5 h-3.5 text-gray-400" />}
            label="Gym ID"
            value={gymId}
            mono
            note="Contact admin to change your Gym ID"
          />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-3 pt-2 border-t border-gray-100">
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <Users className="w-3.5 h-3.5 text-brand-500" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Members</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{memberCount}</p>
          </div>
          <div className="text-center border-x border-gray-100">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CreditCard className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Payments</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{membershipCount}</p>
          </div>
          <div className="text-center">
            <div className="flex items-center justify-center gap-1.5 mb-1">
              <CalendarCheck className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wide">Check-ins</span>
            </div>
            <p className="text-xl font-bold text-gray-900">{attendanceCount}</p>
          </div>
        </div>
      </div>

      {/* Settings Actions */}
      <div className="card divide-y divide-gray-100 overflow-hidden">
        <p className="px-5 pt-4 pb-2 text-xs font-bold text-gray-400 uppercase tracking-widest">Settings</p>

        <button
          onClick={() => openModal('gym-name')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
              <Settings className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">Edit Gym Name</p>
              <p className="text-xs text-gray-400 mt-0.5">Currently: {gymName}</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-gray-500 transition-colors" />
        </button>

        <button
          onClick={() => openModal('password')}
          className="w-full flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
              <Lock className="w-4 h-4" />
            </div>
            <div className="text-left">
              <p className="text-sm font-semibold text-gray-800">Change Password</p>
              <p className="text-xs text-gray-400 mt-0.5">Update your login password</p>
            </div>
          </div>
          <ChevronLeft className="w-4 h-4 text-gray-300 rotate-180 group-hover:text-gray-500 transition-colors" />
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
                <p className="text-sm font-semibold text-gray-800">Delete All Member Data</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
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
                <p className="text-sm font-semibold text-gray-800">Delete Entire Gym Account</p>
                <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
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

      {/* Edit Gym Name Modal */}
      {activeModal === 'gym-name' && (
        <Modal title="Edit Gym Name" onClose={closeModal}>
          <form onSubmit={handleUpdateGymName} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
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
              <p className="text-xs text-gray-400 mt-1.5">2–60 characters, letters, numbers, spaces, or dots only.</p>
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
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
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
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">
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
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Type <span className="text-orange-600 font-mono">{gymName}</span> to confirm
              </label>
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
              <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-1.5">
                Type <span className="text-red-600 font-mono">{gymName}</span> to confirm
              </label>
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
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
      <div className="bg-white rounded-2xl w-full max-w-md overflow-hidden animate-pop-in shadow-2xl">
        <div className={`flex items-center justify-between px-5 py-4 border-b ${danger ? 'border-red-100 bg-red-50' : 'border-gray-100'}`}>
          <h3 className={`font-bold ${danger ? 'text-red-800' : 'text-gray-900'}`}>{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
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
    <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
      <div className="flex items-center gap-1.5 mb-1">
        {icon}
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-sm text-gray-700 break-all ${mono ? 'font-mono' : 'font-medium'}`}>{value}</p>
      <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
        <span className="inline-block w-1.5 h-1.5 rounded-full bg-gray-300 flex-shrink-0" />
        {note}
      </p>
    </div>
  )
}
