import Link from 'next/link'
import {
  User, Phone, Mail, MapPin, Calendar, Heart, Shield, CreditCard,
} from 'lucide-react'
import { getMembershipPageData } from '@/lib/member/member-data'
import { formatDate, formatPlan } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'
import { LogoutButton } from '@/components/member/LogoutButton'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import { ThemeToggle } from '@/components/theme/ThemeToggle'
import { LeaderboardVisibilitySwitch } from './LeaderboardVisibilitySwitch'
import { MembershipWalletCard } from './MembershipWalletCard'
import { PushToggle } from '@/components/member/PushToggle'
import { Stagger, StaggerItem, Pressable } from '@/components/ui/motion'
import { formatCurrency } from '@/lib/utils'
import { isPushConfigured, vapidPublicKey } from '@/lib/push/config'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-slate-500">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{value}</p>
      </div>
    </div>
  )
}

function GroupTitle({ children }: Readonly<{ children: React.ReactNode }>) {
  return <h2 className="mb-2 px-2 text-xs font-bold uppercase tracking-widest text-slate-500">{children}</h2>
}

const actionLink =
  'tap-target flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-bold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500'

export default async function ProfilePage() {
  const done = startPageTimer('profile')

  // Same cache()d fetcher the Membership page uses (member + gym + memberships), so the wallet
  // card costs no new query and uses the shared status rules.
  const data = await getMembershipPageData()
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { member, gym, state } = data
  const { status, daysLeft, latest } = state

  done()

  const pushKey = isPushConfigured() ? vapidPublicKey() : null
  const memberCode = member.member_code ?? `GF${String(member.member_number).padStart(5, '0')}`
  const initials = member.name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
    .map((part) => Array.from(part)[0]?.toUpperCase() ?? '').join('') || 'M'
  const hasPersonal = Boolean(
    member.phone || member.email || member.gender || member.date_of_birth || member.area || member.blood_group,
  )

  return (
    <>
      <MemberTopBar variant="sub" title="Me" backHref="/m/home" actions={<ThemeToggle />} />

      <div className="page-container pb-6 pt-2">
        <Stagger className="space-y-5">
          {/* Identity */}
          <StaggerItem>
            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white shadow-md">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="truncate text-2xl font-bold tracking-tight text-slate-900">{member.name}</p>
                <p className="truncate text-xs text-slate-500">
                  <span className="font-bold">{memberCode}</span> · {gym.name}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">Member since {formatDate(member.created_at)}</p>
              </div>
            </div>
          </StaggerItem>

          {/* Membership wallet card + its actions */}
          <StaggerItem>
            <div className="space-y-3">
              {latest ? (
                <MembershipWalletCard
                  plan={formatPlan(latest.plan)}
                  status={status}
                  endDate={formatDate(latest.end_date)}
                  daysLeft={daysLeft}
                  memberCode={memberCode}
                />
              ) : (
                <section className="tile flex flex-col items-center py-8 text-center">
                  <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
                    <CreditCard className="h-7 w-7 text-slate-400" />
                  </div>
                  <p className="text-sm font-bold text-slate-700">No active membership</p>
                  <p className="mt-1 text-xs text-slate-500">Contact your gym to get started.</p>
                </section>
              )}
              <div className="flex flex-wrap gap-2">
                <Pressable className="flex-1">
                  <Link href="/m/membership" className={`${actionLink} bg-surface-secondary text-slate-800`}>
                    Details
                  </Link>
                </Pressable>
                <Pressable className="flex-1">
                  <Link href="/m/membership/renew" className={`${actionLink} bg-emphasis text-emphasis-fg`}>
                    Renew
                  </Link>
                </Pressable>
                {member.pending_amount > 0 && (
                  <Pressable className="w-full">
                    <Link href="/m/membership/pay-due" className={`${actionLink} w-full bg-red-600 text-white`}>
                      Pay dues {formatCurrency(member.pending_amount)}
                    </Link>
                  </Pressable>
                )}
              </div>
            </div>
          </StaggerItem>

          {/* Personal details */}
          {hasPersonal && (
            <StaggerItem>
              <section>
                <GroupTitle>Personal details</GroupTitle>
                <div className="divide-y divide-surface-border overflow-hidden rounded-3xl border border-surface-border bg-surface-card">
                  <InfoRow icon={Phone}  label="Phone"       value={member.phone} />
                  <InfoRow icon={Mail}   label="Email"       value={member.email} />
                  <InfoRow icon={User}   label="Gender"      value={member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : null} />
                  <InfoRow icon={Calendar} label="Date of Birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : null} />
                  <InfoRow icon={MapPin} label="Area"        value={member.area} />
                  <InfoRow icon={Heart}  label="Blood Group" value={member.blood_group} />
                </div>
              </section>
            </StaggerItem>
          )}

          {/* Emergency contact */}
          {(member.emergency_name || member.emergency_phone) && (
            <StaggerItem>
              <section>
                <GroupTitle>Emergency contact</GroupTitle>
                <div className="divide-y divide-surface-border overflow-hidden rounded-3xl border border-surface-border bg-surface-card">
                  <InfoRow icon={User}  label="Contact Name"   value={member.emergency_name} />
                  <InfoRow icon={Phone} label="Contact Phone"  value={member.emergency_phone} />
                </div>
              </section>
            </StaggerItem>
          )}

          {/* Medical */}
          {member.medical_notes && (
            <StaggerItem>
              <section>
                <GroupTitle>Medical notes</GroupTitle>
                <div className="overflow-hidden rounded-3xl border border-surface-border bg-surface-card">
                  <InfoRow icon={Shield} label="Notes" value={member.medical_notes} />
                </div>
              </section>
            </StaggerItem>
          )}

          {/* Leaderboard opt-out. Seeded from the member row this page already
              loads, so the switch costs no extra query. `!== false`: before the
              20261012 migration the column is absent, and the default is shown. */}
          <StaggerItem>
            <section>
              <GroupTitle>Preferences</GroupTitle>
              <div className="divide-y divide-surface-border overflow-hidden rounded-3xl border border-surface-border bg-surface-card">
                <LeaderboardVisibilitySwitch initialVisible={member.show_on_leaderboard !== false} />
                {pushKey && <PushToggle publicKey={pushKey} />}
              </div>
            </section>
          </StaggerItem>

          {/* Sign out */}
          <StaggerItem>
            <LogoutButton />
          </StaggerItem>
        </Stagger>
      </div>
    </>
  )
}
