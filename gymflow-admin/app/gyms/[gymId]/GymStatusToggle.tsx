'use client'

import { useState } from 'react'
import { Ban, CheckCircle, Loader2 } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export default function GymStatusToggle({ gymId, isActive, gymName }: { gymId: string, isActive: boolean, gymName: string }) {
  const [loading, setLoading] = useState(false)
  const [showModal, setShowModal] = useState(false)
  const router = useRouter()

  async function handleToggle() {
    const action = isActive ? 'deactivate' : 'activate'
    setShowModal(false)
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
          onClick={() => setShowModal(true)}
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

      {/* Custom Confirmation Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0F172A] border border-[#1f2937] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 space-y-4">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-red-500/10 text-red-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                  {isActive ? <Ban className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
                </div>
                <h3 className="text-lg font-bold text-white">
                  {isActive ? 'Deactivate Gym' : 'Activate Gym'}
                </h3>
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">
                Are you sure you want to {isActive ? 'deactivate' : 'activate'} <strong className="text-white">{gymName}</strong>? 
                {isActive && " This will immediately log the owner out of all active sessions and block them from logging in."}
              </p>
            </div>
            
            <div className="bg-slate-900/50 p-4 flex justify-end gap-3 border-t border-[#1f2937]">
              <button 
                onClick={() => setShowModal(false)}
                className="px-4 py-2 text-sm font-semibold text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleToggle}
                className={`px-4 py-2 text-sm font-bold rounded-lg flex items-center gap-2 transition-all ${
                  isActive 
                    ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20' 
                    : 'bg-emerald-500 hover:bg-emerald-600 text-white shadow-lg shadow-emerald-500/20'
                }`}
              >
                Yes, {isActive ? 'Deactivate' : 'Activate'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
