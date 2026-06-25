'use client'

import { useState } from 'react'
import { Ban, CheckCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export default function GymStatusToggle({ gymId, isActive, gymName }: { gymId: string, isActive: boolean, gymName: string }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    const action = isActive ? 'deactivate' : 'activate'
    if (!confirm(`Are you sure you want to ${action} ${gymName}? This will immediately log the owner out of all active sessions.`)) return

    setLoading(true)
    try {
      const res = await fetch(`/api/gyms/toggle-active`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gymId, isActive: !isActive }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || `Failed to ${action} gym`)
      }

      toast.success(`Gym ${action}d successfully`)
      router.refresh()
    } catch (e: any) {
      toast.error(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="admin-card p-5 space-y-4 border-l-4 border-l-red-500">
      <div className="flex items-center gap-2 mb-2">
        <Ban className="w-5 h-5 text-red-400" />
        <h2 className="text-sm font-semibold text-white">Danger Zone</h2>
      </div>
      
      <div>
        <p className="text-sm text-slate-400 mb-4">
          {isActive 
            ? "Deactivating the gym will block the owner from logging in and instantly terminate all active sessions." 
            : "Activating the gym will restore the owner's access and allow them to log in again."}
        </p>
        
        <button 
          onClick={handleToggle}
          disabled={loading}
          className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            isActive 
              ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20' 
              : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20'
          }`}
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 
           isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
          {loading ? 'Processing...' : isActive ? 'Deactivate Gym' : 'Activate Gym'}
        </button>
      </div>
    </div>
  )
}
