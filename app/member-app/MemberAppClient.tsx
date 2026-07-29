'use client'

import { useState } from 'react'
import { LayoutDashboard, Users, MailQuestion, Trophy } from 'lucide-react'
import type { MemberAppData } from '@/types/member-app'
import OverviewCards from '@/features/member-app/components/OverviewCards'
import MemberPortalTable from '@/features/member-app/components/MemberPortalTable'
import InvitationActivity from '@/features/member-app/components/InvitationActivity'
import GamificationPanel from '@/features/member-app/components/GamificationPanel'

type TabId = 'overview' | 'portal' | 'invitations' | 'gamification'

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'overview',     label: 'Overview',      icon: LayoutDashboard },
  { id: 'portal',       label: 'Portal Access', icon: Users },
  { id: 'invitations',  label: 'Invitations',   icon: MailQuestion },
  { id: 'gamification', label: 'Gamification',  icon: Trophy },
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
  void gymId // retained for future use

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
          </div>
        )}
        {tab === 'portal' && <MemberPortalTable rows={data.portalRows} />}
        {tab === 'invitations' && <InvitationActivity invitations={data.invitations} />}
        {tab === 'gamification' && (
          <GamificationPanel summary={data.gamification} leaderboard={data.leaderboard} />
        )}
      </div>
    </div>
  )
}
