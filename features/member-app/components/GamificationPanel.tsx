'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'react-hot-toast'
import { CalendarCheck, Flame, Medal, Settings2, ShieldCheck, Trophy, Zap } from 'lucide-react'
import type { GamificationAward, GamificationSummary } from '@/types/member-app'
import type { GamificationSettingsPatch } from '@/lib/gamification/settings'
import type { GamificationSettings, LeaderboardBoard, LeaderboardRow } from '@/lib/gamification/types'
import { useLeaderboard } from '@/lib/hooks/useLeaderboard'
import {
  markGamificationPrizeAwarded,
  undoGamificationAward,
  updateGamificationSettings,
} from '@/app/owner/member-app/actions'
import {
  OWNER_BOARD_LIMIT,
  summarizeAchievementConfig,
  summarizeBadgeRules,
  summarizeXp,
  type PrizeBoard,
} from '../utils/gamificationConfig'
import { AchievementConfigEditor, BadgeRulesEditor, XpMultipliersEditor } from './GamificationEditors'
import { CurrentLeaders, LeaderboardPreview } from './GamificationBoards'
import GamificationEvents from './GamificationEvents'
import { Card, SectionHeader, StatCard, Toggle } from './ui'

type EditorId = 'xp' | 'badges' | 'achievements'

/** Never show an exception string: it can carry provider or database details. */
const GENERIC_ERROR = 'We could not complete that action. Please try again.'

export default function GamificationPanel({
  summary,
  leaderboard,
}: {
  summary: GamificationSummary
  /** Server-rendered "Last 7 days" rows, so the board paints before the first poll. */
  leaderboard: LeaderboardRow[]
}) {
  const router = useRouter()

  // ── Settings ───────────────────────────────────────────────────────────────
  // Local copy so a save shows at once. The server stays the source of truth:
  // every save ends in router.refresh(), and the fresh props replace this copy.
  const [settings, setSettings] = useState<GamificationSettings>(summary.settings)
  const [saving, setSaving] = useState(false)
  const [editor, setEditor] = useState<EditorId | null>(null)

  // The page also refreshes itself in the background (MemberAppClient polls).
  // A payload that was fetched just before a save lands just after it, and would
  // flip the toggle back for a moment; ignore incoming props while saving.
  const savingRef = useRef(false)
  useEffect(() => {
    if (!savingRef.current) setSettings(summary.settings)
  }, [summary.settings])

  const persist = useCallback(
    async (patch: GamificationSettingsPatch, successMessage: string): Promise<boolean> => {
      savingRef.current = true
      setSaving(true)
      try {
        const result = await updateGamificationSettings(patch)
        if (!result.success || !result.settings) {
          toast.error(result.message || GENERIC_ERROR)
          return false
        }
        setSettings(result.settings)
        toast.success(successMessage)
        // The Router Cache keeps this page's payload for 180 s; without this a
        // tab switch away and back would show the old values again.
        router.refresh()
        return true
      } catch {
        toast.error(GENERIC_ERROR)
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [router],
  )

  const toggleLeaderboards = useCallback(
    async (next: boolean) => {
      if (savingRef.current) return
      // Optimistic: on 4G the switch must move under the thumb, not a second later.
      setSettings(prev => ({ ...prev, leaderboardsEnabled: next }))
      const saved = await persist(
        { leaderboardsEnabled: next },
        next ? 'Leaderboard is now visible in the member app' : 'Leaderboard is now hidden in the member app',
      )
      if (!saved) setSettings(prev => ({ ...prev, leaderboardsEnabled: !next }))
    },
    [persist],
  )

  // ── Boards ─────────────────────────────────────────────────────────────────
  // The week and month boards feed both the table and "Current leaders", so
  // each is fetched by ONE hook and shared. The third hook serves whichever of
  // the other two boards is open and is idle otherwise.
  const [board, setBoard] = useState<LeaderboardBoard>('week')
  const week = useLeaderboard('week', { initialRows: leaderboard, limit: OWNER_BOARD_LIMIT })
  const month = useLeaderboard('month', { limit: OWNER_BOARD_LIMIT })
  const otherBoard: LeaderboardBoard = board === 'all' ? 'all' : 'streak'
  const other = useLeaderboard(otherBoard, {
    limit: OWNER_BOARD_LIMIT,
    enabled: board === 'streak' || board === 'all',
  })
  const active = board === 'week' ? week : board === 'month' ? month : other

  // ── Prizes ─────────────────────────────────────────────────────────────────
  const [awards, setAwards] = useState<GamificationAward[]>(summary.awards)
  const [pendingKey, setPendingKey] = useState<string | null>(null)
  const pendingRef = useRef(false)
  useEffect(() => {
    if (!pendingRef.current) setAwards(summary.awards)
  }, [summary.awards])

  const runAward = useCallback(
    async (key: string, fn: () => Promise<void>) => {
      // Guard against a double tap while the first request is in flight.
      if (pendingRef.current) return
      pendingRef.current = true
      setPendingKey(key)
      try {
        await fn()
      } catch {
        toast.error(GENERIC_ERROR)
      } finally {
        pendingRef.current = false
        setPendingKey(null)
      }
    },
    [],
  )

  const refreshWeek = week.refresh
  const refreshMonth = month.refresh

  const awardPrize = useCallback(
    (prizeBoard: PrizeBoard, memberId: string) =>
      runAward(`award:${prizeBoard}:${memberId}`, async () => {
        const result = await markGamificationPrizeAwarded({ board: prizeBoard, memberId })
        if (!result.success) {
          toast.error(result.message || GENERIC_ERROR)
          // Most likely "the leader has changed": show the owner the current board.
          if (prizeBoard === 'week') refreshWeek()
          else refreshMonth()
          return
        }
        const award = result.award
        if (award) setAwards(prev => [award, ...prev.filter(a => a.id !== award.id)])
        toast.success(result.message)
        router.refresh()
      }),
    [refreshMonth, refreshWeek, router, runAward],
  )

  const undoAward = useCallback(
    (awardId: string) =>
      runAward(`undo:${awardId}`, async () => {
        const result = await undoGamificationAward(awardId)
        if (!result.success) {
          toast.error(result.message || GENERIC_ERROR)
          return
        }
        setAwards(prev => prev.filter(a => a.id !== awardId))
        toast.success(result.message)
        router.refresh()
      }),
    [router, runAward],
  )

  const configCards: Array<{ id: EditorId; title: string; summary: string; icon: React.ReactNode }> = [
    { id: 'xp', title: 'XP Multipliers', summary: summarizeXp(settings), icon: <Zap className="w-3.5 h-3.5" /> },
    { id: 'badges', title: 'Badge Rules', summary: summarizeBadgeRules(settings), icon: <ShieldCheck className="w-3.5 h-3.5" /> },
    {
      id: 'achievements',
      title: 'Achievement Config',
      summary: summarizeAchievementConfig(settings),
      icon: <Settings2 className="w-3.5 h-3.5" />,
    },
  ]

  const editorProps = {
    settings,
    saving,
    onClose: () => setEditor(null),
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard
          label="Total XP Earned"
          value={summary.totalXpEarned.toLocaleString('en-IN')}
          icon={<Trophy className="w-4 h-4" />}
          iconBg="bg-amber-50"
          iconColor="text-amber-600"
        />
        <StatCard
          label="Badges Unlocked"
          value={summary.badgesUnlocked.toLocaleString('en-IN')}
          icon={<Medal className="w-4 h-4" />}
          iconBg="bg-violet-50"
          iconColor="text-violet-600"
        />
        <StatCard
          label="Active Streaks"
          value={summary.activeStreaks.toLocaleString('en-IN')}
          icon={<Flame className="w-4 h-4" />}
          iconBg="bg-red-50"
          iconColor="text-red-600"
        />
        <StatCard
          label="Checked In, Last 7 Days"
          value={summary.checkedInLast7Days.toLocaleString('en-IN')}
          icon={<CalendarCheck className="w-4 h-4" />}
          iconBg="bg-emerald-50"
          iconColor="text-emerald-600"
        />
      </div>

      <LeaderboardPreview board={board} onBoardChange={setBoard} state={active} />

      <CurrentLeaders
        boards={{ week, month }}
        settings={settings}
        awards={awards}
        periods={summary.periods}
        pendingKey={pendingKey}
        onAward={awardPrize}
        onUndo={undoAward}
        onEditPrizes={() => setEditor('achievements')}
      />

      <GamificationEvents />

      <Card>
        <SectionHeader title="Configuration" description="Tune how gamification behaves in the member app." />

        <div className="space-y-3">
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 rounded-xl border border-surface-border">
            <div className="min-w-0">
              <p className="text-sm font-bold text-slate-900">Leaderboards</p>
              <p className="text-xs text-slate-500 mt-0.5">
                {settings.leaderboardsEnabled
                  ? 'Members can see the leaderboard in their app. Turn this off to hide it from them.'
                  : 'The leaderboard is hidden in the member app. You still see the preview here.'}
              </p>
            </div>
            <Toggle
              checked={settings.leaderboardsEnabled}
              onChange={toggleLeaderboards}
              disabled={saving}
              label="Show the leaderboard in the member app"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {configCards.map(card => (
              <div
                key={card.id}
                className="p-4 bg-surface-secondary rounded-xl border border-surface-border flex flex-col gap-2"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center flex-shrink-0">
                    {card.icon}
                  </div>
                  <p className="text-sm font-bold text-slate-900">{card.title}</p>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">{card.summary}</p>
                <button
                  type="button"
                  onClick={() => setEditor(card.id)}
                  aria-label={`Configure ${card.title}`}
                  className="mt-auto self-start min-h-[36px] -ml-2 px-2 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50 hover:text-brand-700 transition-colors"
                >
                  Configure
                </button>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {editor === 'xp' && (
        <XpMultipliersEditor {...editorProps} onSave={patch => persist(patch, 'XP settings saved')} />
      )}
      {editor === 'badges' && (
        <BadgeRulesEditor {...editorProps} onSave={patch => persist(patch, 'Badge rules saved')} />
      )}
      {editor === 'achievements' && (
        <AchievementConfigEditor {...editorProps} onSave={patch => persist(patch, 'Goal and prizes saved')} />
      )}
    </div>
  )
}
