import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { sanitizeUUID } from '@/lib/sanitize'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/gyms/[id]/logs
 *
 * Returns a merged, chronological activity feed for the given gym:
 *   - Member added events  (from `members` table)
 *   - WhatsApp sent events (from `whatsapp_automation_logs`)
 *   - Subscription events  (from `subscription_audit_logs`)
 *
 * Query params:
 *   limit  – max rows per type (default 30)
 *   cursor – ISO timestamp; return entries strictly before this time (pagination)
 */
export async function GET(
  req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  if (!(await verifyRequestAuth(req))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const gymId = sanitizeUUID((await props.params).id)
    if (!gymId) return NextResponse.json({ error: 'Invalid gym id' }, { status: 400 })
    const supabase = createAdminClient()
    const url = new URL(req.url)
    const limitRaw = Number(url.searchParams.get('limit') ?? 30)
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 100) : 30
    const rawCursor = url.searchParams.get('cursor') // ISO timestamp
    // A malformed cursor reached PostgREST as a filter value and came back as a 500 with its error text.
    const cursor = rawCursor && !Number.isNaN(Date.parse(rawCursor)) ? rawCursor : null

    // ── 1. Member additions ──────────────────────────────────────────────────
    let membersQuery = supabase
      .from('members')
      .select('id, name, phone, created_at, membership_status')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) membersQuery = membersQuery.lt('created_at', cursor)

    const { data: members } = await membersQuery

    const memberEvents = (members ?? []).map((m) => ({
      id: `member-${m.id}`,
      type: 'member_added' as const,
      title: `New member added`,
      subtitle: m.name || 'Unknown',
      meta: m.phone ?? undefined,
      timestamp: m.created_at,
      icon: 'user-plus',
      color: 'emerald',
    }))

    // ── 2. WhatsApp sent (automation) ────────────────────────────────────────
    let waQuery = supabase
      .from('whatsapp_automation_logs')
      .select('id, template_name, status, phone_number, sent_at, error_message')
      .eq('gym_id', gymId)
      .order('sent_at', { ascending: false })
      .limit(limit)

    if (cursor) waQuery = waQuery.lt('sent_at', cursor)

    const { data: waLogs } = await waQuery

    const waEvents = (waLogs ?? []).map((w) => ({
      id: `wa-${w.id}`,
      type: 'whatsapp_sent' as const,
      title: `WhatsApp automation: ${w.template_name.replace(/_/g, ' ')}`,
      subtitle: w.status === 'sent' ? 'Queued successfully' : w.status === 'failed' ? `Failed: ${w.error_message ?? 'unknown'}` : w.status,
      meta: w.phone_number ?? undefined,
      timestamp: w.sent_at,
      icon: 'message-circle',
      color: w.status === 'sent' ? 'green' : w.status === 'failed' ? 'red' : 'amber',
    }))

    // ── 3. WhatsApp delivery/read status changes ───────────────────────────
    let waMessagesQuery = supabase
      .from('whatsapp_messages')
      .select('id, message_type, direction, status, from_number, to_number, error_message, created_at, updated_at')
      .eq('gym_id', gymId)
      .order('updated_at', { ascending: false })
      .limit(limit)

    if (cursor) waMessagesQuery = waMessagesQuery.lt('updated_at', cursor)

    const { data: waMessages } = await waMessagesQuery
    const waMessageEvents = (waMessages ?? []).map((message) => {
      const status = message.status ?? 'received'
      return {
        id: `wa-message-${message.id}`,
        type: 'whatsapp_sent' as const,
        title: `WhatsApp ${message.direction}: ${message.message_type}`,
        subtitle: status === 'failed'
          ? `Failed: ${message.error_message ?? 'unknown error'}`
          : `Status: ${status}`,
        meta: message.direction === 'outbound' ? message.to_number : message.from_number,
        timestamp: message.updated_at ?? message.created_at,
        icon: 'message-circle',
        color: status === 'failed' ? 'red' : status === 'read' ? 'emerald' : 'green',
      }
    })

    // ── 4. Subscription audit events ────────────────────────────────────────
    let auditQuery = supabase
      .from('subscription_audit_logs')
      .select('id, action, performed_by, notes, created_at, prev_status, new_status, prev_plan, new_plan')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (cursor) auditQuery = auditQuery.lt('created_at', cursor)

    const { data: auditLogs } = await auditQuery

    const auditEvents = (auditLogs ?? []).map((a) => ({
      id: `audit-${a.id}`,
      type: 'subscription_event' as const,
      title: a.action,
      subtitle: a.notes ?? (a.new_status ? `→ ${a.new_status}` : undefined) ?? a.performed_by,
      meta: `by ${a.performed_by}`,
      timestamp: a.created_at,
      icon: 'shield',
      color: 'indigo',
    }))

    // ── Merge & sort ─────────────────────────────────────────────────────────
    const all = [...memberEvents, ...waEvents, ...waMessageEvents, ...auditEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit * 2) // cap final list

    return NextResponse.json({ events: all, total: all.length })
  } catch (err: any) {
    console.error('[GymLogs]', err)
    console.error('[GymLogs]', err)
    return NextResponse.json({ error: 'Request failed' }, { status: 500 })
  }
}
