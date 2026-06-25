'use client'

import { useState } from 'react'
import { Send, Loader2, X, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'
import { useRouter } from 'next/navigation'

export default function SupportTicketModal({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) {
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [type, setType] = useState('query')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  if (!isOpen) return null

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!subject || !message) return

    setLoading(true)
    try {
      const res = await fetch('/api/support/ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, message, type }),
      })
      
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to submit ticket')
      
      toast.success('Support ticket submitted successfully. We will get back to you soon!')
      setSubject('')
      setMessage('')
      setType('query')
      onClose()
      
      // Broadcast to admin
      import('@/lib/supabase/client').then(({ createClient }) => {
        const supabase = createClient()
        const channel = supabase.channel('admin_support_channel')
        channel.subscribe(async (status: string) => {
          if (status === 'SUBSCRIBED') {
            await channel.send({
              type: 'broadcast',
              event: 'refetch_tickets',
              payload: { timestamp: Date.now() }
            })
            supabase.removeChannel(channel)
          }
        })
      })

      router.refresh()
    } catch (e: any) {
      toast.error(e.message || 'Failed to submit ticket')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Contact Support</h3>
              <p className="text-sm text-slate-500">Send us a query, report a bug, or request a feature.</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              What can we help you with?
            </label>
            <select 
              value={type}
              onChange={e => setType(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            >
              <option value="query">General Query</option>
              <option value="issue">Technical Issue</option>
              <option value="bug">Report a Bug</option>
              <option value="high_priority">High Priority / Urgent Help</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Subject
            </label>
            <input 
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="Brief summary of your issue..."
              required
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
              Message Details
            </label>
            <textarea 
              value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Please provide as much detail as possible..."
              required
              rows={5}
              className="w-full bg-slate-50 border border-slate-200 text-slate-900 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 transition-all resize-none"
            />
          </div>

          {type === 'high_priority' && (
            <div className="flex items-start gap-3 p-3 bg-amber-50 text-amber-700 rounded-xl border border-amber-100">
              <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
              <p className="text-xs leading-relaxed">
                <strong>High Priority:</strong> Please only use this for critical issues like system downtime or severe data errors.
              </p>
            </div>
          )}

          <div className="pt-2 flex justify-end gap-3">
            <button 
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit"
              disabled={loading || !subject || !message}
              className="px-5 py-2.5 bg-brand-600 text-white text-sm font-bold rounded-xl shadow-lg shadow-brand-500/20 hover:bg-brand-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              {loading ? 'Submitting...' : 'Submit Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
