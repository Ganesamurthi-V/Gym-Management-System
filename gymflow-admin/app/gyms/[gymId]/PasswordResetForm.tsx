'use client'

import { useState } from 'react'
import { KeyRound, Check, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PasswordResetForm({ userId }: { userId: string }) {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    if (!password || password.length < 6) {
      toast.error('Password must be at least 6 characters')
      return
    }

    setLoading(true)
    setSuccess(false)
    try {
      const res = await fetch(`/api/gyms/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, password }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'Failed to update password')
      }

      setSuccess(true)
      setPassword('')
      toast.success('Password updated successfully')
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleReset} className="admin-card p-5 space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <KeyRound className="w-5 h-5 text-indigo-400" />
        <h2 className="text-sm font-semibold text-white">Reset Account Password</h2>
      </div>
      
      <div>
        <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
          New Password
        </label>
        <div className="flex gap-3">
          <input
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter new secure password"
            className="admin-input flex-1"
            required
            minLength={6}
          />
          <button 
            type="submit"
            disabled={loading || !password}
            className="admin-btn-primary whitespace-nowrap min-w-[140px] justify-center"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 
             success ? <Check className="w-4 h-4" /> : <KeyRound className="w-4 h-4" />}
            {loading ? 'Saving...' : success ? 'Updated' : 'Update Password'}
          </button>
        </div>
        <p className="text-xs text-slate-500 mt-2">
          This will immediately change the gym owner's password. They will be logged out of active sessions.
        </p>
      </div>
    </form>
  )
}
