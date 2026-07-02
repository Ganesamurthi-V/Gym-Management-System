'use client'

import { useState, useEffect } from 'react'
import { HeadphonesIcon, Send, Loader2, CheckCircle2, X, Trash2 } from 'lucide-react'
import toast from 'react-hot-toast'

type Gym = { id: string; name: string; owner: { email: string } }
type Ticket = {
  id: string;
  gym_id: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  created_at: string;
  gyms: { name: string; owner_id: string };
}

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'tickets'>('send')
  
  // Existing state
  const [gyms, setGyms] = useState<Gym[]>([])
  const [loading, setLoading] = useState(true)
  
  const [selectedGym, setSelectedGym] = useState('')
  const [subject, setSubject] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('info')
  const [sending, setSending] = useState(false)

  // New state for tickets
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loadingTickets, setLoadingTickets] = useState(false)
  const [isClearing, setIsClearing] = useState(false)

  // Resolve Ticket Modal State
  const [resolvingTicket, setResolvingTicket] = useState<Ticket | null>(null)
  const [replySubject, setReplySubject] = useState('')
  const [replyMessage, setReplyMessage] = useState('')
  const [resolving, setResolving] = useState(false)

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

  // Poll for new tickets every 30 seconds when on the tickets tab
  useEffect(() => {
    if (activeTab !== 'tickets') return
    fetchTickets()
    const interval = setInterval(fetchTickets, 30_000)
    return () => clearInterval(interval)
  }, [activeTab])

  async function fetchTickets() {
    setLoadingTickets(true)
    try {
      const res = await fetch('/api/support/tickets')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setTickets(data)
    } catch (e: any) {
      toast.error('Failed to load tickets')
    } finally {
      setLoadingTickets(false)
    }
  }

  function openResolveModal(ticket: Ticket) {
    setReplySubject(`Re: ${ticket.subject}`)
    setReplyMessage(`Your issue regarding "${ticket.subject}" has been resolved. Let us know if you need any further assistance.`)
    setResolvingTicket(ticket)
  }

  async function submitResolve(e: React.FormEvent) {
    e.preventDefault()
    if (!resolvingTicket) return

    setResolving(true)
    try {
      const res = await fetch('/api/support/tickets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ticketId: resolvingTicket.id, 
          status: 'resolved',
          replySubject,
          replyMessage
        }),
      })
      if (!res.ok) throw new Error('Failed to update')
      toast.success('Ticket resolved and message sent!')
      
      setResolvingTicket(null)
      fetchTickets()
    } catch (e) {
      toast.error('Failed to resolve ticket')
    } finally {
      setResolving(false)
    }
  }

  async function handleClear(ticketId?: string) {
    if (isClearing) return
    setIsClearing(true)

    // Optimistic UI update
    if (ticketId) {
      setTickets(prev => prev.filter(t => t.id !== ticketId))
    } else {
      setTickets(prev => prev.filter(t => t.status !== 'resolved'))
    }

    try {
      const res = await fetch('/api/support/tickets/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticketId, clearAll: !ticketId }),
      })
      if (!res.ok) throw new Error('Failed to clear tickets')
    } catch (e: any) {
      toast.error('Failed to clear tickets')
      console.error(e)
    } finally {
      setIsClearing(false)
    }
  }

  const hasResolvedTickets = tickets.some(t => t.status === 'resolved')

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Support & Messaging</h1>
        <p className="text-slate-500 text-sm mt-0.5">Manage incoming gym requests or send broadcast notifications</p>
      </div>

      <div className="flex items-center gap-2 border-b border-[#1f2937] pb-px">
        <button 
          onClick={() => setActiveTab('send')}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 ${activeTab === 'send' ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-white'}`}
        >
          Send Message
        </button>
        <button 
          onClick={() => setActiveTab('tickets')}
          className={`px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'tickets' ? 'text-indigo-400 border-indigo-400' : 'text-slate-400 border-transparent hover:text-white'}`}
        >
          Incoming Tickets
          {tickets.filter(t => t.status === 'open').length > 0 && activeTab !== 'tickets' && (
            <span className="w-2 h-2 rounded-full bg-red-500"></span>
          )}
        </button>
      </div>

      {activeTab === 'send' ? (
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
      ) : (
        <div className="space-y-4">
          {hasResolvedTickets && (
            <div className="flex justify-end">
              <button 
                onClick={() => handleClear()}
                className="text-xs font-semibold text-slate-400 hover:text-red-400 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-500/10"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Clear Resolved Tickets
              </button>
            </div>
          )}

          {loadingTickets ? (
            <div className="p-8 flex justify-center"><Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /></div>
          ) : tickets.length === 0 ? (
            <div className="admin-card p-12 text-center text-slate-500">No support tickets found.</div>
          ) : (
            tickets.map(ticket => (
              <div key={ticket.id} className="admin-card p-5 group relative overflow-hidden">
                <div className="flex items-start justify-between gap-4 relative z-10">
                  <div className="flex-1 min-w-0 pr-8">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider ${
                        ticket.type === 'high_priority' ? 'bg-red-500/10 text-red-400 border border-red-500/20' :
                        ticket.type === 'bug' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' :
                        'bg-blue-500/10 text-blue-400 border border-blue-500/20'
                      }`}>
                        {ticket.type.replace('_', ' ')}
                      </span>
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider ${
                        ticket.status === 'open' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                      }`}>
                        {ticket.status}
                      </span>
                      <span className="text-xs text-slate-500">
                        {new Date(ticket.created_at).toLocaleString()}
                      </span>
                    </div>
                    <h3 className={`text-lg font-bold text-white mb-1 ${ticket.status === 'resolved' ? 'line-through opacity-50' : ''}`}>{ticket.subject}</h3>
                    <p className="text-sm font-medium text-slate-400 mb-3">From: {ticket.gyms?.name}</p>
                    <div className={`p-4 bg-[#0F172A] rounded-xl border border-[#1f2937] text-slate-300 text-sm whitespace-pre-wrap ${ticket.status === 'resolved' ? 'opacity-50' : ''}`}>
                      {ticket.message}
                    </div>
                  </div>
                  
                  {ticket.status === 'open' && (
                    <button 
                      onClick={() => openResolveModal(ticket)}
                      className="px-4 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/20 rounded-xl text-sm font-bold transition-colors flex-shrink-0 flex items-center gap-2"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Resolve
                    </button>
                  )}

                  {ticket.status === 'resolved' && (
                    <button 
                      onClick={() => handleClear(ticket.id)}
                      className="absolute top-0 right-0 p-2 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Clear ticket"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Resolve Ticket Modal */}
      {resolvingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#0F172A] border border-[#1f2937] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-6 border-b border-[#1f2937]">
              <h3 className="text-lg font-bold text-white">Resolve Ticket</h3>
              <p className="text-sm text-slate-400 mt-1">Send a confirmation message to {resolvingTicket.gyms?.name}</p>
            </div>
            <form onSubmit={submitResolve} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Reply Subject
                </label>
                <input 
                  type="text"
                  value={replySubject}
                  onChange={e => setReplySubject(e.target.value)}
                  required
                  className="admin-input"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  Reply Message
                </label>
                <textarea 
                  value={replyMessage}
                  onChange={e => setReplyMessage(e.target.value)}
                  required
                  rows={4}
                  className="admin-input resize-none"
                />
              </div>
              <div className="pt-4 flex justify-end gap-3">
                <button 
                  type="button"
                  onClick={() => setResolvingTicket(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  disabled={resolving || !replySubject || !replyMessage}
                  className="px-5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {resolving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  {resolving ? 'Resolving...' : 'Resolve & Send'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

