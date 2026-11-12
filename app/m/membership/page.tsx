import Link from 'next/link'
import { CheckCircle2, AlertCircle, Clock, CreditCard } from 'lucide-react'
import { getMembershipPageData } from '@/lib/member/member-data'
import { formatDate, formatPlan, formatCurrency } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'
import { Stagger, StaggerItem, Pressable } from '@/components/ui/motion'
import { MemberTopBar, TopBarButton } from '@/components/member/MemberTopBar'
import MembershipQR from './MembershipQR'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function MembershipPage() {
  const done = startPageTimer('membership')

  // member + gym + memberships fetched in parallel (one round trip, not three)
  const data = await getMembershipPageData()
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { member, memberships, state } = data
  const { status, daysLeft, latest } = state

  done()

  const memberCode = member.member_code ?? `GF${String(member.member_number).padStart(5, '0')}`

  const statusConfig = {
    active:   { label: 'Active',         cls: 'status-active',    icon: CheckCircle2, progress: 100 },
    expiring: { label: 'Expiring Soon',  cls: 'status-expiring',  icon: AlertCircle,  progress: 20 },
    expired:  { label: 'Expired',        cls: 'status-expired',   icon: AlertCircle,  progress: 0 },
    none:     { label: 'No Membership',  cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: Clock, progress: 0 },
  }
  const cfg = statusConfig[status]

  return (
    <>
      <MemberTopBar
        variant="sub"
        title="Membership"
        backHref="/m/profile"
        actions={
          <TopBarButton href="/m/membership/card" label="Full card">
            <CreditCard aria-hidden="true" className="h-5 w-5" />
          </TopBarButton>
        }
      />

      <div className="page-container pb-6 pt-2">
      <Stagger className="space-y-4">
        {/* Compact status line: the hero card now lives on Me */}
        <StaggerItem>
          {latest ? (
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 truncate text-lg font-bold tracking-tight text-slate-900">{formatPlan(latest.plan)}</p>
              <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${cfg.cls}`}>
                {cfg.label}
                {daysLeft !== null && daysLeft > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}
              </span>
            </div>
          ) : (
            <section className="tile flex flex-col items-center py-10 text-center">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                <CreditCard className="h-7 w-7 text-slate-400" />
              </div>
              <p className="text-sm font-bold text-slate-700">No active membership</p>
              <p className="mt-1 text-xs text-slate-500">Contact your gym to get started.</p>
            </section>
          )}
        </StaggerItem>

        {latest && (
          <StaggerItem>
            <section className="tile grid grid-cols-2 gap-px overflow-hidden bg-surface-border p-0">
              {[
                ['Start Date', formatDate(latest.start_date), ''],
                ['End Date', formatDate(latest.end_date), ''],
                ['Amount Paid', formatCurrency(latest.amount), ''],
                ['Payment Mode', latest.payment_mode, 'capitalize'],
              ].map(([label, value, extra]) => (
                <div key={label} className="bg-surface-card p-4">
                  <p className="text-xs text-slate-500">{label}</p>
                  <p className={`mt-1 text-sm font-bold text-slate-900 ${extra}`}>{value}</p>
                </div>
              ))}
            </section>
          </StaggerItem>
        )}

        {/* Pending dues */}
        {member.pending_amount > 0 && (
          <StaggerItem>
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm font-bold text-red-700">
                Pending dues: {formatCurrency(member.pending_amount)}
              </p>
              <p className="mt-0.5 text-xs text-red-600">Pay online or settle at your gym.</p>
              <Link
                href="/m/membership/pay-due"
                className="mt-3 inline-flex min-h-[44px] items-center rounded-full bg-red-600 px-5 text-sm font-bold text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500"
              >
                Pay dues
              </Link>
            </div>
          </StaggerItem>
        )}

        <StaggerItem>
          <Pressable>
            <Link
              href="/m/membership/renew"
              className="tap-target flex min-h-[52px] w-full items-center justify-center rounded-full bg-emphasis px-4 text-sm font-bold text-emphasis-fg"
            >
              Renew membership
            </Link>
          </Pressable>
        </StaggerItem>

        {/* QR code: kept here too so members can check in from the details page */}
        <StaggerItem>
          <MembershipQR memberCode={memberCode} />
        </StaggerItem>

        {/* Membership history */}
        {memberships.length > 1 && (
          <StaggerItem>
            <section>
              <h2 className="mb-3 text-sm font-bold text-slate-700">History</h2>
              <div className="tile divide-y divide-surface-border overflow-hidden">
                {memberships.slice(1).map((m) => (
                  <div key={m.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{formatPlan(m.plan)}</p>
                      <p className="text-xs text-slate-500">
                        {formatDate(m.start_date)} – {formatDate(m.end_date)}
                      </p>
                    </div>
                    <p className="text-sm font-bold text-slate-700">{formatCurrency(m.amount)}</p>
                  </div>
                ))}
              </div>
            </section>
          </StaggerItem>
        )}
      </Stagger>
      </div>
    </>
  )
}
