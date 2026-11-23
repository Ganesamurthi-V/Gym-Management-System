import { createAdminClient } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, User, ShieldCheck, Database, CalendarClock, BadgeCheck, Phone } from 'lucide-react'
import Link from 'next/link'
import { BreadcrumbLabel } from '@/components/layout/breadcrumb-context'
import { MetricCards } from '@/components/dashboard/metric-cards'
import { PageToolbar } from '@/components/dashboard/page-toolbar'
import { StatusBadge } from '@/components/dashboard/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import PasswordResetForm from './PasswordResetForm'
import GymStatusToggle from './GymStatusToggle'
import SubscriptionPanel from './SubscriptionPanel'
import GymFeedbackPanel from './GymFeedbackPanel'

export const dynamic = 'force-dynamic'

export default async function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params
  const supabase = createAdminClient()

  const gymRes = await supabase
    .from('gyms')
    // phone and onboarding_data added: the phone shown below used to come from the auth
    // user alone, so the number an owner typed into onboarding never appeared here.
    .select('id, name, owner_id, created_at, is_active, phone, onboarding_data')
    .eq('id', gymId)
    .single()

  if (gymRes.error || !gymRes.data) notFound()

  const gym = gymRes.data

  // Fetch owner details
  const { data: { user: owner } } = await supabase.auth.admin.getUserById(gym.owner_id)

  /*
    The gym's own contact number, preferred over the owner's account number below.

    Three sources in descending trustworthiness:
      1. gyms.phone — what onboarding and account settings now both write.
      2. onboarding_data.phone — where it lived exclusively until that change, so every
         gym onboarded before it has a number here and nothing in the column. Dropping
         this fallback would blank the field for all existing gyms.
      3. the owner's auth record — a different thing entirely (the number given at signup,
         not the gym's contact line), kept last so a gym that never finished onboarding
         still shows something.
  */
  const onboarding = (gym.onboarding_data ?? {}) as Record<string, unknown>
  const onboardingPhone = typeof onboarding.phone === 'string' ? onboarding.phone.trim() : ''
  const gymPhone = gym.phone?.trim() || onboardingPhone || null
  const ownerPhone = owner?.user_metadata?.mobile_number || owner?.phone || null

  const registered = new Date(gym.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="space-y-4">
      <BreadcrumbLabel label={gym.name} />
      <Button variant="ghost" size="sm" asChild className="-ml-2">
        <Link href="/gyms">
          <ArrowLeft />
          Back
        </Link>
      </Button>

      <PageToolbar title={gym.name} description={`Registered ${registered}`}>
        {gym.is_active ? <StatusBadge tone="success">Active</StatusBadge> : <StatusBadge tone="error">Banned</StatusBadge>}
      </PageToolbar>

      {/* Stats */}
      <MetricCards
        items={[
          { icon: User, label: 'Owner ID', value: gym.owner_id.slice(0, 8), tone: 'blue', footnote: gym.owner_id },
          { icon: Database, label: 'Database ID (Gym)', value: gym.id.slice(0, 8), tone: 'sky', footnote: gym.id },
          {
            icon: CalendarClock,
            label: 'Account Created',
            value: owner?.created_at ? new Date(owner.created_at).toLocaleDateString('en-IN') : 'Unknown',
            tone: 'violet',
          },
          {
            icon: BadgeCheck,
            label: 'Email Verified',
            value: owner?.email_confirmed_at ? 'Yes, Verified' : 'Pending',
            tone: owner?.email_confirmed_at ? 'emerald' : 'amber',
            valueTone: owner?.email_confirmed_at ? 'emerald' : 'amber',
          },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Account Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="size-4" />
              Gym Owner Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="space-y-4 text-sm">
              <div className="space-y-1">
                <dt className="text-muted-foreground text-xs">Primary Email</dt>
                <dd className="flex items-center gap-2 break-all">
                  <Mail className="text-muted-foreground size-4 shrink-0" />
                  {owner?.email ?? 'No email found'}
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-muted-foreground text-xs">Gym Phone</dt>
                <dd className="flex items-center gap-2">
                  <Phone className="text-muted-foreground size-4 shrink-0" />
                  {gymPhone ?? 'Not provided'}
                </dd>
              </div>

              {/*
                Only when it differs. The owner's signup number and the gym's contact line are
                usually the same person's phone, and printing one number twice under two labels
                reads as a rendering fault rather than as two facts. Shown when they genuinely
                diverge, because then which is which matters for support.
              */}
              {ownerPhone && ownerPhone !== gymPhone && (
                <div className="space-y-1">
                  <dt className="text-muted-foreground text-xs">Account Phone</dt>
                  <dd className="text-muted-foreground flex items-center gap-2">
                    <Phone className="size-4 shrink-0" />
                    {ownerPhone}
                  </dd>
                </div>
              )}

              <div className="space-y-1">
                <dt className="text-muted-foreground text-xs">Owner Name</dt>
                <dd>{owner?.user_metadata?.full_name || owner?.user_metadata?.name || 'Not provided'}</dd>
              </div>

              <div className="space-y-1">
                <dt className="text-muted-foreground text-xs">Auth Status</dt>
                <dd>
                  <StatusBadge tone="success">Active Account</StatusBadge>
                </dd>
              </div>

              <div className="space-y-1">
                <dt className="text-muted-foreground text-xs">Last Sign In</dt>
                <dd className="text-muted-foreground">
                  {owner?.last_sign_in_at ? new Date(owner.last_sign_in_at).toLocaleString('en-IN') : 'Never'}
                </dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        {/* Security & Password */}
        <div className="space-y-4">
          <PasswordResetForm userId={gym.owner_id} />
          <GymStatusToggle gymId={gym.id} isActive={gym.is_active} gymName={gym.name} />
        </div>
      </div>

      {/* Subscription Management */}
      <SubscriptionPanel gymId={gym.id} gymName={gym.name} />

      {/* Owner Feedback (gym-wise) */}
      <GymFeedbackPanel gymId={gym.id} />
    </div>
  )
}
