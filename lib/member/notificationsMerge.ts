import type { GymNotice, NoticeKind } from '@/types/notice'
import type { RenewalRequest } from '@/types/renewal'

/** Pure part of the member inbox (no server-only import, so it is unit-tested directly). */
export type MemberNotification =
  | { id: string; kind: 'notice'; noticeKind: NoticeKind; title: string; body: string; at: string }
  | { id: string; kind: 'request'; approved: boolean; title: string; body: string; at: string }

export const NOTIFICATION_WINDOW_DAYS = 30
export const NOTIFICATION_CAP = 30

export function noticeToNotification(n: GymNotice): MemberNotification {
  return { id: `notice:${n.id}`, kind: 'notice', noticeKind: n.kind, title: n.title, body: n.body, at: n.createdAt }
}

/** A reviewed request becomes a notification; a pending one is not news yet (returns null). */
export function requestToNotification(r: RenewalRequest): MemberNotification | null {
  if (r.status !== 'approved' && r.status !== 'rejected') return null
  const approved = r.status === 'approved'
  const label = r.kind === 'due' ? 'Due payment' : 'Renewal'
  return {
    id: `request:${r.id}`,
    kind: 'request',
    approved,
    title: `${label} ${approved ? 'approved' : 'not approved'}`,
    body: approved
      ? (r.kind === 'due' ? `Your payment of Rs ${r.amount} was recorded.` : `Your ${r.planName} plan is active.`)
      : (r.rejectReason?.trim() || 'Please contact the gym or send the payment proof again.'),
    at: r.reviewedAt ?? r.createdAt,
  }
}

/** Newest first, only the last 30 days, at most 30 items. `now` is injectable for tests. */
export function mergeNotifications(
  notices: GymNotice[],
  requests: (MemberNotification | null)[],
  now: number = Date.now(),
): MemberNotification[] {
  const cutoff = now - NOTIFICATION_WINDOW_DAYS * 86_400_000
  return [...notices.map(noticeToNotification), ...requests.filter((r): r is MemberNotification => r !== null)]
    .filter(n => Date.parse(n.at) >= cutoff)
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at))
    .slice(0, NOTIFICATION_CAP)
}
