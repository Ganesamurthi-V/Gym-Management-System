'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Users, MailQuestion, Trophy } from 'lucide-react'
import type { MemberAppData, MemberAppOverview, MemberPortalRow, InvitationActivity as InvitationRow } from '@/types/member-app'
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel'
import OverviewCards from '@/features/member-app/components/OverviewCards'
import MemberPortalTable from '@/features/member-app/components/MemberPortalTable'
import InvitationActivity from '@/features/member-app/components/InvitationActivity'
import GamificationPanel from '@/features/member-app/components/GamificationPanel'
import { tourAttr } from '@/lib/tours/anchors'

type TabId = 'portal' | 'invitations' | 'gamification'

const TABS: Array<{ id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { id: 'portal',       label: 'Portal Access', icon: Users },
  { id: 'invitations',  label: 'Invitations',   icon: MailQuestion },
  { id: 'gamification', label: 'Gamification',  icon: Trophy },
]

/**
 * Derives overview stats from the current portal rows so the cards update
 * immediately after mutations without waiting for a server round-trip.
 */
function deriveOverview(rows: MemberPortalRow[]): MemberAppOverview {
  const now = Date.now()
  const todayStart = new Date().setHours(0, 0, 0, 0)
  const weekAgo = now - 7 * 86_400_000
  const monthAgo = now - 30 * 86_400_000

  let active = 0
  let pending = 0
  let todayLogins = 0
  let weeklyActive = 0
  let monthlyActive = 0

  for (const row of rows) {
    if (row.portalStatus === 'enabled' && !row.suspended) active++
    if (row.invitationStatus === 'pending') pending++
    if (row.lastLogin) {
      const t = new Date(row.lastLogin).getTime()
      if (t >= todayStart) todayLogins++
      if (t >= weekAgo) weeklyActive++
      if (t >= monthAgo) monthlyActive++
    }
  }

  return {
    appStatus: 'Online',
    activeMembers: active,
    pendingInvitations: pending,
    todaysLogins: todayLogins,
    weeklyActiveUsers: weeklyActive,
    monthlyActiveUsers: monthlyActive,
  }
}

export default function MemberAppClient({
  gymId,
  gymName,
  initialData,
}: {
  gymId: string
  gymName: string
  initialData: MemberAppData
}) {
  const router = useRouter()
  const [tab, setTab] = useState<TabId>('portal')
  const [portalRows, setPortalRows] = useState<MemberPortalRow[]>(initialData.portalRows)
  const [invitations, setInvitations] = useState<InvitationRow[]>(initialData.invitations)
  const [overview, setOverview] = useState<MemberAppOverview>(initialData.overview)

  // Keep overview in sync with portal rows
  useEffect(() => {
    setOverview(deriveOverview(portalRows))
  }, [portalRows])

  // Sync from server when initialData changes (after router.refresh())
  useEffect(() => {
    setPortalRows(initialData.portalRows)
    setInvitations(initialData.invitations)
    setOverview(initialData.overview)
  }, [initialData])

  // Realtime: subscribe to member table changes for this gym
  const handleRealtimeChange = useCallback(() => {
    // Server re-fetch to get fresh data (busts the 60s cache via revalidate)
    router.refresh()
  }, [router])

  useRealtimeChannel({
    channelName: `owner_member_app_${gymId}`,
    subscriptions: [
      {
        type: 'postgres_changes',
        filter: {
          event: 'UPDATE',
          schema: 'public',
          table: 'members',
          filter: `gym_id=eq.${gymId}`,
        },
        callback: handleRealtimeChange,
      },
      {
        type: 'postgres_changes',
        filter: {
          event: 'INSERT',
          schema: 'public',
          table: 'members',
          filter: `gym_id=eq.${gymId}`,
        },
        callback: handleRealtimeChange,
      },
    ],
    onResync: handleRealtimeChange,
  })

  /**
   * Called by child components after a successful mutation.
   * Updates local state immediately for responsiveness, then triggers
   * a background server refresh so the cache and overview update.
   */
  const onMutationComplete = useCallback((updatedRows?: MemberPortalRow[]) => {
    if (updatedRows) {
      setPortalRows(updatedRows)
    }
    // Trigger server re-render to update invitations + any other derived state
    router.refresh()
  }, [router])

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

      {/* Overview cards — always visible, derived from current state */}
      <div {...tourAttr('memberAppOverview')}>
        <OverviewCards overview={overview} />
      </div>

      {/* Tabs */}
      <div {...tourAttr('memberAppTabs')} className="border-b border-surface-border overflow-x-auto">
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
        {tab === 'portal' && <MemberPortalTable rows={portalRows} onMutationComplete={onMutationComplete} />}
        {tab === 'invitations' && <InvitationActivity invitations={invitations} />}
        {tab === 'gamification' && (
          <GamificationPanel summary={initialData.gamification} leaderboard={initialData.leaderboard} />
        )}
      </div>
    </div>
  )
}
