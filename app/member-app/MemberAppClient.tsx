'use client'

import { useState } from 'react'
import {
  LayoutDashboard, Users, MailQuestion, Activity, LogIn,
  MessageCircle, Trophy, BarChart3, Wrench, Settings,
} from 'lucide-react'
import type { MemberAppData } from '@/types/member-app'
import OverviewCards from '@/features/member-app/components/OverviewCards'
import MemberPortalTable from '@/features/member-app/components/MemberPortalTable'
import InvitationActivity from '@/features/member-app/components/InvitationActivity'
import MemberActivityLog from '@/features/member-app/components/MemberActivityLog'
import LoginOverview from '@/features/member-app/components/LoginOverview'
import WhatsAppTemplates from '@/features/member-app/components/WhatsAppTemplates'
import GamificationPanel from '@/features/member-app/components/GamificationPanel'
import AnalyticsCharts from '@/features/member-app/components/AnalyticsCharts'
import MaintenancePanel from '@/features/member-app/components/MaintenancePanel'
import PortalSettings from '@/features/member-app/components/PortalSettings'

/**
 * Tab ids are additive: new surfaces (Push Notifications, Announcements,
 * QR Check-In, Feedback, Devices, Feature Flags, Releases, Crash Analytics)
 * slot into TABS and the switch below without touching existing sections.
 */
type TabId =
  | 'overview' | 'portal' | 'invitations' | 'activity' | 'logins'
  | 'templates' | 'gamification' | 'analytics' | 'maintenance' | 'settings'

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview',     label: 'Overview',      icon: LayoutDashboard },
  { id: 'portal',       label: 'Portal Access', icon: Users },
  { id: 'invitations',  label: 'Invitations',   icon: MailQuestion },
  { id: 'activity',     label: 'Activity',      icon: Activity },
  { id: 'logins',       label: 'Logins',        icon: LogIn },
  { id: 'templates',    label: 'Templates',     icon: MessageCircle },
  { id: 'gamification', label: 'Gamification',  icon: Trophy },
  { id: 'analytics',    label: 'Analytics',     icon: BarChart3 },
  { id: 'maintenance',  label: 'Maintenance',   icon: Wrench },
  { id: 'settings',     label: 'Settings',      icon: Settings },
]

export default function MemberAppClient({
  gymId,
  gymName,
  initialData,
}: {
  gymId: string
  gymName: string
  initialData: MemberAppData
}) {
  const [tab, setTab] = useState<TabId>('overview')
  const data = initialData

  return (
    <div className="max-w-8xl mx-auto space-y-5 sm:space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900 tracking-tight">
          Member App
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Monitor portal health and manage member access for {gymName}.
        </p>
      </div>

      {/* Overview cards stay visible across tabs as the module's vitals row. */}
      <OverviewCards overview={data.overview} />

      {/* Tabs */}
      <div className="border-b border-surface-border overflow-x-auto">
        <div role="tablist" aria-label="Member app sections" className="flex gap-1 min-w-max">
          {TABS.map(({ id, label, icon: Icon }) => {
            const active = tab === id
            return (
              <button
                key={id}
                type="button"
                role="tab"
                id={`tab-${id}`}
                aria-selected={active}
                aria-controls={`panel-${id}`}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 text-sm font-semibold border-b-2 -mb-px whitespace-nowrap transition-colors ${
                  active
                    ? 'border-brand-500 text-brand-700'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Panel */}
      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'overview' && (
          <div className="space-y-4 sm:space-y-6">
            <MemberPortalTable rows={data.portalRows} />
            <MemberActivityLog activity={data.activity} />
          </div>
        )}
        {tab === 'portal' && <MemberPortalTable rows={data.portalRows} />}
        {tab === 'invitations' && <InvitationActivity invitations={data.invitations} />}
        {tab === 'activity' && <MemberActivityLog activity={data.activity} />}
        {tab === 'logins' && (
          <LoginOverview summary={data.loginSummary} recentLogins={data.recentLogins} />
        )}
        {tab === 'templates' && <WhatsAppTemplates templates={data.templates} />}
        {tab === 'gamification' && (
          <GamificationPanel summary={data.gamification} leaderboard={data.leaderboard} />
        )}
        {tab === 'analytics' && <AnalyticsCharts analytics={data.analytics} />}
        {tab === 'maintenance' && (
          <MaintenancePanel gymId={gymId} maintenance={data.maintenance} />
        )}
        {tab === 'settings' && <PortalSettings gymId={gymId} settings={data.settings} />}
      </div>
    </div>
  )
}
