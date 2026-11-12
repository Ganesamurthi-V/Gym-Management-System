import { AlertCircle, CheckCircle2, Megaphone } from 'lucide-react'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import { getMembershipPageData } from '@/lib/member/member-data'
import { getMemberNotifications } from '@/lib/member/notifications'
import { MarkNotificationsSeen } from '@/components/member/MarkNotificationsSeen'
import { istDateOf, shortDate } from '@/lib/progress/chart'
import type { NoticeKind } from '@/types/notice'
import { Stagger, StaggerItem } from '@/components/ui/motion'
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
    <>
      <MemberTopBar
        variant="sub"
        title="Notifications"
        backHref="/m/home"
        backLabel="Back to home"
        actions={pushKey ? <PushHeaderButton publicKey={pushKey} /> : undefined}
      />
      <div className="page-container pb-6 pt-2">
      <MarkNotificationsSeen latestAt={items[0]?.at ?? null} />

      {failed && <p className="mb-4 text-sm text-slate-500">Could not load notifications</p>}

      {items.length === 0 ? (
        !failed && <p className="text-sm text-slate-500">No notifications yet. Messages from your gym will appear here.</p>
      ) : (
        <Stagger className="space-y-3">
          {items.map(n => {
            const date = shortDate(istDateOf(n.at))
            if (n.kind === 'notice') {
              return (
                <StaggerItem key={n.id} className={`tile border-l-4 p-4 ${NOTICE_STYLE[n.noticeKind].border}`}>
                  <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                    <Megaphone aria-hidden="true" className="h-3.5 w-3.5" />
                    {NOTICE_STYLE[n.noticeKind].label}
                  </p>
                  <h2 className="mt-1 text-sm font-bold text-slate-900">{n.title}</h2>
                  <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{date}{gymName ? ` · by ${gymName}` : ''}</p>
                </StaggerItem>
              )
            }
            const Icon = n.approved ? CheckCircle2 : AlertCircle
            return (
              <StaggerItem key={n.id} className="tile flex gap-3 p-4">
                <Icon aria-hidden="true" className={`mt-0.5 h-5 w-5 shrink-0 ${n.approved ? 'text-emerald-600' : 'text-amber-600'}`} />
                <div className="min-w-0">
                  <h2 className="text-sm font-bold text-slate-900">{n.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-2 text-xs text-slate-400">{date}</p>
                </div>
              </StaggerItem>
            )
          })}
        </Stagger>
      )}
      </div>
    </>
  )
}
