'use client'

import { useEffect, useState } from 'react'
import { CheckCircle2, Gift } from 'lucide-react'
import { api } from '@/lib/api/client'
import type { MemberEvent } from '@/lib/gamification/events'
import { daysLeftText, goalSentence, rewardSentence } from '@/lib/gamification/eventCopy'
import { istToday } from '@/lib/gamification/periods'

/**
 * Challenges set by the gym owner, with the member's own progress.
 *
 * Fetched on the client from the member-events route rather than added to the
 * page's server fetch: the Rewards page already waits on four queries plus an
 * RPC, and a failure here must never blank the achievements below it, so this
 * block simply renders nothing on error or when there are no events.
 * Refetched when the tab regains focus so a check-in made at the desk shows up.
 */
export default function MemberEvents() {
  const [events, setEvents] = useState<MemberEvent[] | null>(null)
  const [today, setToday] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    setToday(istToday())
    const load = async () => {
      try {
        const res = await api.get<{ data: { events: MemberEvent[] } }>('/api/gamification/member-events')
        if (alive) setEvents(res.data.events)
      } catch {
        /* keep whatever is shown; the block is optional */
      }
    }
    void load()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        setToday(istToday())
        void load()
      }
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      alive = false
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  if (!events || events.length === 0 || !today) return null

  return (
    <section aria-labelledby="events-heading" className="mb-5">
      <h2 id="events-heading" className="mb-3 text-xs font-black uppercase tracking-[0.1em] text-slate-500">
        Challenges
      </h2>
      <ul className="space-y-3">
        {events.map(ev => {
          const upcoming = today < ev.startDate
          const pct = ev.goalTarget > 0 ? Math.min(100, (ev.progress / ev.goalTarget) * 100) : 0
          const reward = rewardSentence(ev)
          return (
            <li key={ev.id} className="rounded-2xl border border-slate-200 bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <p className="text-sm font-black text-slate-900 min-w-0 break-words">{ev.title}</p>
                <span className="shrink-0 text-[11px] font-bold text-slate-500 tabular-nums">
                  {daysLeftText(ev, today)}
                </span>
              </div>
              <p className="mt-0.5 text-xs font-medium text-slate-600">{goalSentence(ev)}</p>
              {ev.description && <p className="mt-0.5 text-xs text-slate-400">{ev.description}</p>}

              {!upcoming && (
                <div className="mt-3">
                  <div
                    role="progressbar"
                    aria-label={`${ev.title} progress`}
                    aria-valuemin={0}
                    aria-valuemax={ev.goalTarget}
                    aria-valuenow={Math.min(ev.progress, ev.goalTarget)}
                    className="h-2.5 overflow-hidden rounded-full bg-slate-100"
                  >
                    <div
                      className={`h-full rounded-full ${ev.completed ? 'bg-emerald-500' : 'bg-brand-500'}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500 tabular-nums">
                    {Math.min(ev.progress, ev.goalTarget)} of {ev.goalTarget} {ev.goalTarget === 1 ? 'day' : 'days'}
                  </p>
                </div>
              )}

              {ev.completed ? (
                <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-emerald-700">
                  <p className="flex items-center gap-1.5 text-xs font-bold">
                    <CheckCircle2 aria-hidden="true" className="h-4 w-4 shrink-0" />
                    {ev.rewardXp > 0 ? `Completed - ${ev.rewardXp.toLocaleString('en-IN')} XP added` : 'Completed'}
                  </p>
                  {ev.rewardText && (
                    <p className="mt-1 text-xs font-medium">
                      {ev.rewardGiven ? `Collected: ${ev.rewardText}` : `Collect your ${ev.rewardText} at the desk`}
                    </p>
                  )}
                </div>
              ) : (
                reward && (
                  <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-violet-700">
                    <Gift aria-hidden="true" className="h-4 w-4 shrink-0" />
                    Reward: {reward}
                  </p>
                )
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
