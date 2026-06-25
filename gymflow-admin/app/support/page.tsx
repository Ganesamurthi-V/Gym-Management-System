'use client'

import { useState, useEffect } from 'react'
import { HeadphonesIcon, Send, Loader2, CheckCircle2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Gym = { id: string; name: string; owner: { email: string } }

export default function SupportPage() {
  const [gyms, setGyms] = useState<Gym[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedGym, setSelectedGym] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('info')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    fetch('/api/gyms')
      .then(res => res.json())
      .then(data => {
        if (data.error || !Array.isArray(data)) throw new Error(data.error || 'Invalid response')
        setGyms(data)
        setLoading(false)
      })
      .catch((e) => {
        toast.error('Failed to load gyms')
        console.error(e)
        setLoading(false)
      })
  }, [])

  async function handleSend(e: React.FormEvent) {
    e.preventDefault()
    if (!selectedGym || !subject || !body) return

    setSending(true)
    try {
      const res = await fetch('/api/support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gym_id: selectedGym, subject, body, type }),
      })
      
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to send')
      
      toast.success('Message sent to gym owner successfully!')
      setSubject('')
      setBody('')
      setSelectedGym('')
      setType('info')
    } catch (e: any) {
      toast.error(e.message || 'Failed to send message')
      console.error(e)
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Support & Messaging</h1>
        <p className="text-slate-500 text-sm mt-0.5">Send direct notifications to gym owners' dashboards</p>
      </div>

      <form onSubmit={handleSend} className="admin-card p-6 space-y-5">
        <div className="flex items-center gap-3 pb-4 border-b border-[#1f2937]">
          <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
            <HeadphonesIcon className="w-5 h-5 text-indigo-400" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-white">New Message</h2>
            <p className="text-xs text-slate-400">Broadcast updates, warnings, or support replies.</p>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Select Recipient Gym
          </label>
          <select 
            value={selectedGym}
            onChange={e => setSelectedGym(e.target.value)}
            required
            className="admin-input"
            disabled={loading}
          >
            <option value="" disabled>-- Select a gym --</option>
            {gyms.map(g => (
              <option key={g.id} value={g.id}>{g.name} ({g.owner?.email})</option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Message Subject
            </label>
            <input 
              type="text"
              value={subject}
              onChange={e => setSubject(e.target.value)}
              placeholder="e.g. Action Required: Subscription Renewal"
              required
              className="admin-input"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Message Type
            </label>
            <select 
              value={type}
              onChange={e => setType(e.target.value)}
              className="admin-input"
            >
              <option value="info">Information</option>
              <option value="warning">Warning</option>
              <option value="error">Critical Error</option>
              <option value="success">Success Note</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
            Message Body
          </label>
          <textarea 
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Write your message here. The gym owner will see this on their dashboard notifications..."
            required
            rows={6}
            className="admin-input resize-none"
          />
        </div>

        <div className="pt-4 border-t border-[#1f2937] flex justify-end">
          <button 
            type="submit"
            disabled={sending || !selectedGym || !subject || !body}
            className="admin-btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            {sending ? 'Sending...' : 'Send Message'}
          </button>
        </div>
      </form>
    </div>
  )
}
