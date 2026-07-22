'use client'

import { useState, useEffect, useRef } from 'react'
import { Bell, Info, AlertTriangle, ShieldCheck, Bug, Ticket as TicketIcon, X, Trash2, Wifi, WifiOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import toast from 'react-hot-toast'

type AdminMessage = {
  id: string;
  gym_id: string;
  subject: string;
  body: string;
  type: string;
  read_at: string | null;
  created_at: string;
}

type SupportTicket = {
  id: string;
  gym_id: string;
  subject: string;
  message: string;
  type: string;
  status: string;
  created_at: string;
  resolved_at: string | null;
}

export default function SupportTabsClient({
  initialMessages,
  initialTickets,
  gymId,
}: {
  initialMessages: AdminMessage[]
  initialTickets: SupportTicket[]
  gymId: string
}) {
  const [activeTab, setActiveTab] = useState<'notifications' | 'open' | 'closed'>('notifications')

  const [messages, setMessages] = useState<AdminMessage[]>(initialMessages)
  const [tickets, setTickets] = useState<SupportTicket[]>(initialTickets)
  const [isClearing, setIsClearing] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  // IDs of messages that just arrived in real-time (for "NEW" highlight)
  const [newMsgIds, setNewMsgIds] = useState<Set<string>>(new Set())

  const supabase = createClient()

  // Keep a ref to latest state so realtime closures can read current values
  const messagesRef = useRef(messages)
  const ticketsRef = useRef(tickets)
  useEffect(() => { messagesRef.current = messages }, [messages])
  useEffect(() => { ticketsRef.current = tickets }, [tickets])

  // ── Sync when SSR props change (e.g. hard refresh) ────────────────────────
  useEffect(() => {
    setMessages(initialMessages)
    setTickets(initialTickets)
  }, [initialMessages, initialTickets])

  // ── Supabase Realtime ─────────────────────────────────────────────────────
  useEffect(() => {
    const channel = supabase
      .channel(`gym_support_realtime_${gymId}`, {
        config: { broadcast: { ack: false } },
      })

      // ── admin_messages: new notification from GymFlow team ──
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_messages',
          filter: `gym_id=eq.${gymId}`,
        },
        (payload: any) => {
          const newMsg = payload.new as AdminMessage
          // Avoid duplicates (page might already have it from SSR)
          if (messagesRef.current.some((m) => m.id === newMsg.id)) return

          setMessages((prev) => [newMsg, ...prev])
          setNewMsgIds((prev) => new Set([...prev, newMsg.id]))

          // Remove "NEW" highlight after 8 s
          setTimeout(() => {
            setNewMsgIds((prev) => {
              const next = new Set(prev)
              next.delete(newMsg.id)
              return next
            })
          }, 8000)

          toast('📣 New message from GymFlow Support!', {
            duration: 6000,
            style: { fontWeight: '600' },
          })
        }
      )

      // ── support_tickets: ticket status updated (open → resolved) ──
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'support_tickets',
          filter: `gym_id=eq.${gymId}`,
        },
        (payload: any) => {
          const updated = payload.new as SupportTicket
          setTickets((prev) =>
            prev.map((t) => (t.id === updated.id ? updated : t))
          )
          if (updated.status === 'resolved') {
            toast('✅ Your support ticket has been resolved!', { duration: 5000 })
            // Jump the user to closed tab so they see the resolution
            setActiveTab('closed')
          }
        }
      )

      // ── support_tickets: new ticket submitted (echoed back for consistency) ──
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'support_tickets',
          filter: `gym_id=eq.${gymId}`,
        },
        (payload: any) => {
          const newTicket = payload.new as SupportTicket
          if (ticketsRef.current.some((t) => t.id === newTicket.id)) return
          setTickets((prev) => [newTicket, ...prev])
        }
      )

      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [gymId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Clear helpers ─────────────────────────────────────────────────────────
  const handleClear = async (type: 'admin_messages' | 'support_tickets', id?: string) => {
    if (isClearing) return
    setIsClearing(true)

    // Optimistic UI
    if (type === 'admin_messages') {
      setMessages((prev) => id ? prev.filter((m) => m.id !== id) : prev.filter((m) => !m.read_at))
    } else {
      setTickets((prev) => id ? prev.filter((t) => t.id !== id) : prev.filter((t) => t.status !== 'resolved'))
    }

    try {
      const res = await fetch('/api/support/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, id, clearAll: !id }),
      })
      if (!res.ok) throw new Error('Failed to clear')
    } catch (e: any) {
      toast.error('Failed to clear items')
      console.error(e)
    } finally {
      setIsClearing(false)
    }
  }

  const openTickets   = tickets.filter((t) => t.status === 'open')
  const closedTickets = tickets.filter((t) => t.status === 'resolved')
  const readMessages  = messages.filter((m) => m.read_at)
  const unreadCount   = messages.filter((m) => !m.read_at).length

  return (
    <div className="space-y-6">
      {/* ── Tab bar ── */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-px overflow-x-auto hide-scrollbar">
        <button
          onClick={() => setActiveTab('notifications')}
          className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'notifications' ? 'text-brand-600 border-brand-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Notifications
          {unreadCount > 0 && activeTab !== 'notifications' && (
            <span className="min-w-[18px] h-[18px] px-1 rounded-full bg-brand-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('open')}
          className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'open' ? 'text-brand-600 border-brand-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Open Issues
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] ml-1">{openTickets.length}</span>
        </button>
        <button
          onClick={() => setActiveTab('closed')}
          className={`whitespace-nowrap px-4 py-2.5 text-sm font-semibold transition-colors border-b-2 flex items-center gap-2 ${activeTab === 'closed' ? 'text-brand-600 border-brand-600' : 'text-slate-500 border-transparent hover:text-slate-800'}`}
        >
          Closed Issues
          <span className="px-1.5 py-0.5 rounded-md bg-slate-100 text-slate-600 text-[10px] ml-1">{closedTickets.length}</span>
        </button>

        {/* Realtime connection badge */}
        <div className="ml-auto flex items-center gap-1.5 pr-1 flex-shrink-0">
          {isConnected ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <Wifi className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-semibold text-emerald-600 hidden sm:block">Live</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[10px] font-medium text-slate-400 hidden sm:block">Connecting…</span>
            </>
          )}
        </div>
      </div>

      <div className="card overflow-hidden relative">
        <div className="divide-y divide-slate-100">

          {/* NOTIFICATIONS TAB */}
          {activeTab === 'notifications' && (
            <>
              {readMessages.length > 0 && (
                <div className="flex justify-end p-3 border-b border-slate-100">
                  <button
                    onClick={() => handleClear('admin_messages')}
                    className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear Read
                  </button>
                </div>
              )}
              {messages.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Bell className="w-8 h-8 text-slate-300" />
                  </div>
                  <p>No messages yet</p>
                </div>
              ) : (
                messages.map((msg) => {
                  const isUnread = !msg.read_at
                  const isNew = newMsgIds.has(msg.id)
                  return (
                    <div
                      key={msg.id}
                      className={`group p-5 md:p-6 flex items-start gap-4 transition-all duration-500 relative ${
                        isNew
                          ? 'bg-brand-50 ring-1 ring-inset ring-brand-200'
                          : isUnread
                          ? 'bg-brand-50/30'
                          : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-1 ${
                        msg.type === 'error'   ? 'bg-red-100 text-red-600' :
                        msg.type === 'warning' ? 'bg-amber-100 text-amber-600' :
                        msg.type === 'success' ? 'bg-emerald-100 text-emerald-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {msg.type === 'error'   ? <Bug className="w-5 h-5" /> :
                         msg.type === 'warning' ? <AlertTriangle className="w-5 h-5" /> :
                         msg.type === 'success' ? <ShieldCheck className="w-5 h-5" /> :
                         <Info className="w-5 h-5" />}
                      </div>

                      <div className="flex-1 min-w-0 pr-8">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <h3 className={`text-sm md:text-base text-slate-900 ${isUnread ? 'font-bold' : 'font-semibold'}`}>
                            {msg.subject}
                          </h3>
                          {isNew && (
                            <span className="px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded-full bg-brand-500 text-white animate-pulse">
                              NEW
                            </span>
                          )}
                          {isUnread && !isNew && (
                            <span className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0" />
                          )}
                        </div>

                        <p className="text-sm text-slate-600 leading-relaxed whitespace-pre-wrap">
                          {msg.body}
                        </p>

                        <div className="flex items-center gap-3 mt-3 text-xs text-slate-400 font-medium">
                          <span>{new Date(msg.created_at).toLocaleString('en-IN', {
                            day: 'numeric', month: 'long', year: 'numeric', hour: 'numeric', minute: '2-digit',
                          })}</span>
                          <span>•</span>
                          <span>From: GymFlow Support</span>
                        </div>
                      </div>

                      {!isUnread && (
                        <button
                          onClick={() => handleClear('admin_messages', msg.id)}
                          className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          title="Clear message"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  )
                })
              )}
            </>
          )}

          {/* OPEN ISSUES TAB */}
          {activeTab === 'open' && (
            openTickets.length === 0 ? (
              <div className="p-12 text-center text-slate-500">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <TicketIcon className="w-8 h-8 text-slate-300" />
                </div>
                <p>No open issues</p>
              </div>
            ) : (
              openTickets.map((ticket) => (
                <div key={ticket.id} className="p-5 md:p-6 flex items-start gap-4 hover:bg-slate-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className={`px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider ${
                        ticket.type === 'high_priority' ? 'bg-red-100 text-red-600' :
                        ticket.type === 'bug' ? 'bg-amber-100 text-amber-600' :
                        'bg-blue-100 text-blue-600'
                      }`}>
                        {ticket.type.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-slate-400 font-medium">
                        {new Date(ticket.created_at).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 mb-1">{ticket.subject}</h3>
                    <p className="text-sm text-slate-600 whitespace-pre-wrap">{ticket.message}</p>
                  </div>
                </div>
              ))
            )
          )}

          {/* CLOSED ISSUES TAB */}
          {activeTab === 'closed' && (
            <>
              {closedTickets.length > 0 && (
                <div className="flex justify-end p-3 border-b border-slate-100">
                  <button
                    onClick={() => handleClear('support_tickets')}
                    className="text-xs font-semibold text-slate-500 hover:text-red-500 transition-colors flex items-center gap-1.5 px-3 py-1.5 rounded-lg hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Clear All
                  </button>
                </div>
              )}
              {closedTickets.length === 0 ? (
                <div className="p-12 text-center text-slate-500">
                  <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <ShieldCheck className="w-8 h-8 text-slate-300" />
                  </div>
                  <p>No closed issues</p>
                </div>
              ) : (
                closedTickets.map((ticket) => (
                  <div key={ticket.id} className="group p-5 md:p-6 flex items-start gap-4 bg-slate-50/50 relative hover:bg-slate-50 transition-colors">
                    <div className="flex-1 min-w-0 opacity-75 pr-8">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-md uppercase tracking-wider bg-emerald-100 text-emerald-600">
                          Resolved
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {ticket.resolved_at
                            ? new Date(ticket.resolved_at).toLocaleString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
                            : 'Unknown'}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 mb-1 line-through decoration-slate-300">{ticket.subject}</h3>
                      <p className="text-sm text-slate-500 whitespace-pre-wrap">{ticket.message}</p>
                    </div>

                    <button
                      onClick={() => handleClear('support_tickets', ticket.id)}
                      className="absolute top-4 right-4 p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                      title="Clear ticket"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))
              )}
            </>
          )}

        </div>
      </div>
    </div>
  )
}
