'use client'

import { useState, useEffect } from 'react'
import { Wifi, WifiOff } from 'lucide-react'
import { toast } from 'sonner'
import { useRealtimeInvalidation } from '@/lib/use-realtime-invalidation'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ComposeForm } from './_components/compose-form'
import { ResolveDialog } from './_components/resolve-dialog'
import { TicketList, type TicketFilter } from './_components/ticket-list'
import type { Gym, Ticket } from './_components/types'

export default function SupportPage() {
  const [activeTab, setActiveTab] = useState<'send' | 'tickets'>('send')
  // Distinguish owner feedback (type='feedback', carries a star rating) from support tickets.
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>('all')
  
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
  const [drafting, setDrafting] = useState(false)
  const [needsHuman, setNeedsHuman] = useState(false)

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

  const { isConnected: isRealtimeConnected } = useRealtimeInvalidation({
    channelName: 'admin:support',
    enabled: activeTab === 'tickets',
    onInvalidate: fetchTickets,
  })

  // Fetch tickets on initial load and when switching to tickets tab
  useEffect(() => {
    if (activeTab !== 'tickets') return
    fetchTickets()
    // Fallback polling at 60s (in case realtime disconnects temporarily)
    const interval = setInterval(fetchTickets, 60_000)
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
    setNeedsHuman(false)
    setResolvingTicket(ticket)
  }

  // Fills the form only; the admin edits and sends through the normal resolve flow.
  async function handleAiDraft() {
    if (!resolvingTicket) return
    setDrafting(true)
    try {
      const res = await fetch(`/api/support/tickets/${resolvingTicket.id}/draft`, { method: 'POST' })
      const data = await res.json().catch(() => null)
      if (!res.ok) throw new Error(data?.error || 'Failed to write a draft')
      setReplySubject(data.subject)
      setReplyMessage(data.body)
      setNeedsHuman(data.needsHuman === true)
    } catch (e: any) {
      toast.error(e.message || 'Failed to write a draft')
    } finally {
      setDrafting(false)
    }
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
    <div className="space-y-6">
      <PageToolbar
        title="Support & Messaging"
        description="Manage incoming gym requests or send broadcast notifications"
      />

      <Tabs value={activeTab} onValueChange={v => setActiveTab(v as 'send' | 'tickets')}>
        <TabsList>
          <TabsTrigger value="send">Send Message</TabsTrigger>
          <TabsTrigger value="tickets">
            Incoming Tickets
            {tickets.filter(t => t.status === 'open').length > 0 && activeTab !== 'tickets' && (
              <span className="bg-destructive size-2 rounded-full" />
            )}
            {isRealtimeConnected ? <Wifi className="size-3" /> : <WifiOff className="text-muted-foreground size-3" />}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="send">
          <ComposeForm
            gyms={gyms}
            loading={loading}
            sending={sending}
            selectedGym={selectedGym}
            subject={subject}
            body={body}
            type={type}
            onGymChange={setSelectedGym}
            onSubjectChange={setSubject}
            onBodyChange={setBody}
            onTypeChange={setType}
            onSubmit={handleSend}
          />
        </TabsContent>

        <TabsContent value="tickets">
          <TicketList
            tickets={tickets}
            filter={ticketFilter}
            loading={loadingTickets}
            hasResolved={hasResolvedTickets}
            onFilterChange={setTicketFilter}
            onClearResolved={() => handleClear()}
            onClearOne={id => handleClear(id)}
            onResolve={openResolveModal}
          />
        </TabsContent>
      </Tabs>

      <ResolveDialog
        ticket={resolvingTicket}
        subject={replySubject}
        message={replyMessage}
        drafting={drafting}
        resolving={resolving}
        needsHuman={needsHuman}
        onSubjectChange={setReplySubject}
        onMessageChange={setReplyMessage}
        onAiDraft={handleAiDraft}
        onSubmit={submitResolve}
        onCancel={() => setResolvingTicket(null)}
      />
    </div>
  )
}
