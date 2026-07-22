import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'

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
    const { id: gymId } = await props.params
    const supabase = createAdminClient()
    const url = new URL(req.url)
    const limit = Math.min(Number(url.searchParams.get('limit') ?? 30), 100)
    const cursor = url.searchParams.get('cursor') // ISO timestamp

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
      title: `WhatsApp: ${w.template_name.replace(/_/g, ' ')}`,
      subtitle: w.status === 'sent' ? 'Delivered' : w.status === 'failed' ? `Failed: ${w.error_message ?? 'unknown'}` : 'Skipped',
      meta: w.phone_number ?? undefined,
      timestamp: w.sent_at,
      icon: 'message-circle',
      color: w.status === 'sent' ? 'green' : w.status === 'failed' ? 'red' : 'amber',
    }))

    // ── 3. Subscription audit events ─────────────────────────────────────────
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
    const all = [...memberEvents, ...waEvents, ...auditEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, limit * 2) // cap final list

    return NextResponse.json({ events: all, total: all.length })
  } catch (err: any) {
    console.error('[GymLogs]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
