import Link from 'next/link'
import { AlertCircle, CheckCircle2, ChevronLeft, Megaphone } from 'lucide-react'
import { getMembershipPageData } from '@/lib/member/member-data'
import { getMemberNotifications } from '@/lib/member/notifications'
import { MarkNotificationsSeen } from '@/components/member/MarkNotificationsSeen'
import { istDateOf, shortDate } from '@/lib/progress/chart'
import type { NoticeKind } from '@/types/notice'
import { PushHeaderButton } from '@/components/member/PushHeaderButton'
import { isPushConfigured, vapidPublicKey } from '@/lib/push/config'

// Left border carries the kind; the kind word stays visible because colour alone is not enough.
const NOTICE_STYLE: Record<NoticeKind, { border: string; label: string }> = {
  closure: { border: 'border-l-red-400', label: 'Closure' },
  holiday: { border: 'border-l-amber-400', label: 'Holiday' },
  batch: { border: 'border-l-emerald-400', label: 'New batch' },
  offer: { border: 'border-l-brand-400', label: 'Offer' },
  info: { border: 'border-l-slate-300', label: 'Info' },
}

export default async function NotificationsPage() {
  const [{ items, failed }, data] = await Promise.all([getMemberNotifications(), getMembershipPageData()])
  const gymName = data?.gym.name
  const pushKey = isPushConfigured() ? vapidPublicKey() : null

  return (
    <div className="page-container py-6">
      <MarkNotificationsSeen latestAt={items[0]?.at ?? null} />
      <header className="mb-5 flex items-center gap-1">
        <Link
          href="/m/home"
          aria-label="Back to home"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
        >
          <ChevronLeft aria-hidden="true" className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Notifications</h1>
        {pushKey && <div className="ml-auto"><PushHeaderButton publicKey={pushKey} /></div>}
      </header>

      {failed && <p className="mb-4 text-sm text-slate-500">Could not load notifications</p>}

      {items.length === 0 ? (
        !failed && <p className="text-sm text-slate-500">No notifications yet. Messages from your gym will appear here.</p>
      ) : (
        <ul className="space-y-3">
          {items.map(n => {
            const date = shortDate(istDateOf(n.at))
            if (n.kind === 'notice') {
              return (
                <li key={n.id} className={`card rounded-2xl border-l-4 p-4 ${NOTICE_STYLE[n.noticeKind].border}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />
                    {NOTICE_STYLE[n.noticeKind].label}
                  </p>
                  <h2 className="mt-1 text-sm font-bold text-slate-900">{n.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{date}{gymName ? ` · by ${gymName}` : ''}</p>
                </li>
              )
            }
            const Icon = n.approved ? CheckCircle2 : AlertCircle
            return (
              <li key={n.id} className="card flex gap-3 rounded-2xl p-4">
                <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${n.approved ? 'text-emerald-600' : 'text-amber-600'}`} />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900">{n.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{date}</p>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
