'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { LogOut, User, Settings, Lock, Bell, ChevronRight, X, Eye, EyeOff } from 'lucide-react'

export default function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [isGymModalOpen, setIsGymModalOpen] = useState(false)
  const [isPassModalOpen, setIsPassModalOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [gymName, setGymName] = useState<string>('')
  const [newGymName, setNewGymName] = useState<string>('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [userId, setUserId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function getData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setEmail(user.email || null)
        setUserId(user.id)

        const { data: gym } = await supabase
          .from('gyms')
          .select('name')
          .eq('owner_id', user.id)
          .single()

        if (gym) setGymName(gym.name)
      }
    }
    getData()
  }, [supabase])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  const handleUpdateGymName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId) return

    // Validate: 2-60 chars, no special characters except spaces and dots
    const isValid = /^[a-zA-Z0-9\s.]{2,60}$/.test(newGymName)
    if (!isValid) {
      setMessage({ type: 'error', text: 'Gym name must be 2-60 characters and contain only letters, numbers, spaces, or dots.' })
      return
    }

    setIsSaving(true)
    setMessage(null)

    const { error } = await supabase
      .from('gyms')
      .update({ name: newGymName })
      .eq('owner_id', userId)

    if (error) {
      setMessage({ type: 'error', text: error.message })
      setIsSaving(false)
    } else {
      setGymName(newGymName)
      setMessage({ type: 'success', text: 'Gym name updated' })
      setTimeout(() => {
        setIsGymModalOpen(false)
        setMessage(null)
      }, 1500)
      setIsSaving(false)
    }
  }

  const handleUpdatePassword = async (e: React.FormEvent) => {
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
      setIsSaving(false)
    } else {
      setMessage({ type: 'success', text: 'Password updated. You may need to log in again on other devices.' })
      setNewPassword('')
      setConfirmPassword('')
      setTimeout(() => {
        setIsPassModalOpen(false)
        setMessage(null)
      }, 2000)
      setIsSaving(false)
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-8 h-8 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center hover:ring-2 hover:ring-brand-300 transition-all"
      >
        <span className="text-brand-700 font-bold text-xs">
          {email ? email.substring(0, 2).toUpperCase() : 'GY'}
        </span>
      </button>

      {isPassModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden animate-pop-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Change Password</h3>
              <button onClick={() => { setIsPassModalOpen(false); setMessage(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdatePassword} className="p-5 space-y-4">
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showPass ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      className="input-field pr-10"
                      placeholder="Min 8 chars, 1 number"
                      required
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
                  <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Confirm New Password</label>
                  <input
                    type={showPass ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    className="input-field"
                    placeholder="Confirm password"
                    required
                  />
                </div>
              </div>

              {message && (
                <div className={`text-sm p-3 rounded-xl font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {message.text}
                </div>
              )}

              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? 'Updating...' : 'Update Password'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isGymModalOpen && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm overflow-hidden animate-pop-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h3 className="font-bold text-gray-900">Edit Gym Name</h3>
              <button onClick={() => { setIsGymModalOpen(false); setMessage(null); }} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateGymName} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-400 uppercase tracking-wider mb-1.5">Gym Name</label>
                <input
                  type="text"
                  value={newGymName}
                  onChange={(e) => setNewGymName(e.target.value)}
                  className="input-field"
                  placeholder="Enter gym name"
                  required
                />
              </div>

              {message && (
                <div className={`text-sm p-3 rounded-xl font-medium ${message.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'}`}>
                  {message.text}
                </div>
              )}

              <button type="submit" disabled={isSaving} className="btn-primary">
                {isSaving ? 'Saving...' : 'Save'}
              </button>
            </form>
          </div>
        </div>
      )}

      {isOpen && (
        <>
          {/* Mobile Overlay */}
          <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsOpen(false)} />

          {/* Dropdown Panel */}
          <div className="fixed md:absolute top-14 md:top-full left-4 right-4 md:left-auto md:right-0 mt-2 md:w-64 bg-white rounded-2xl shadow-xl border border-gray-100 z-50 overflow-hidden transition-all animate-pop-in">
            <div className="p-4 border-b border-gray-50">
              <p className="text-xs font-medium text-gray-400 mb-1">Account</p>
              <p className="text-sm font-bold text-gray-900 truncate">{email}</p>
            </div>

            <div className="p-2">
              <button
                onClick={() => {
                  setNewGymName(gymName)
                  setIsGymModalOpen(true)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-blue-50 rounded-lg flex items-center justify-center text-blue-600">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">Edit Gym Name</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
              </button>

              <button
                onClick={() => {
                  setIsPassModalOpen(true)
                  setIsOpen(false)
                }}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-gray-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                    <Lock className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-gray-700">Change Password</span>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-400" />
              </button>

              <div className="w-full flex items-center justify-between p-3 rounded-xl opacity-60 cursor-not-allowed">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col items-start">
                    <span className="text-sm font-semibold text-gray-700">Notifications</span>
                    <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-md font-bold uppercase tracking-wider">Coming soon</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-2 border-t border-gray-50">
              <button
                onClick={handleLogout}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
