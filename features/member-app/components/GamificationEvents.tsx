'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-hot-toast'
import { Gift, Plus } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { EVENT_LIMITS } from '@/lib/gamification/constants'
import {
  dateRangeText,
  eventStatus,
  formatEventDate,
  goalSentence,
  rewardSentence,
  type EventStatus,
} from '@/lib/gamification/eventCopy'
import { istDateOf, istToday } from '@/lib/gamification/periods'
import { useGymEvents, type OwnerEvent } from '../hooks/useGymEvents'
import EventEditor from './EventEditor'
import Modal, { PrimaryButton, SecondaryButton } from './Modal'
import { Badge, Card, EmptyState, SectionHeader, type BadgeTone } from './ui'

const STATUS: Record<EventStatus, { label: string; tone: BadgeTone }> = {
  upcoming: { label: 'Upcoming', tone: 'blue' },
  running: { label: 'Running', tone: 'green' },
  ended: { label: 'Ended', tone: 'slate' },
  paused: { label: 'Paused', tone: 'amber' },
}

const GENERIC_ERROR = 'We could not complete that action. Please try again.'

interface Completion {
  memberId: string
  memberName: string
  memberPhone: string | null
  completedAt: string
  xpAwarded: number
  rewardText: string | null
  rewardGivenAt: string | null
}

export default function GamificationEvents() {
  const { events, error, reload } = useGymEvents()
  // Computed after mount: the server's clock/timezone must not decide a status.
  const [today, setToday] = useState<string | null>(null)
  useEffect(() => setToday(istToday()), [])

  const [editing, setEditing] = useState<OwnerEvent | 'new' | null>(null)
  const [viewing, setViewing] = useState<OwnerEvent | null>(null)

  const activeCount = events?.filter(e => e.isActive).length ?? 0
  const atLimit = activeCount >= EVENT_LIMITS.maxActiveEvents

  const createButton = (
    <PrimaryButton onClick={() => setEditing('new')} disabled={atLimit}>
      <Plus className="w-4 h-4 mr-1" aria-hidden="true" />
      Create event
    </PrimaryButton>
  )

  return (
    <Card>
      <SectionHeader
        title="Events"
        description="Challenges with a reward, like 'Check in 7 days this month and win a protein shaker'."
        action={events && events.length > 0 ? createButton : undefined}
      />

      {atLimit && (
        <p className="text-xs text-amber-700 mb-3">
          You have {EVENT_LIMITS.maxActiveEvents} active events, the most allowed. Pause or delete one to add another.
        </p>
      )}

      {events === null && !error && <p className="text-sm text-slate-500 py-6 text-center">Loading events...</p>}

      {events === null && error && (
        <div className="py-6 text-center">
          <p className="text-sm text-slate-500 mb-3">We could not load your events.</p>
          <SecondaryButton onClick={() => void reload()}>Try again</SecondaryButton>
        </div>
      )}

      {events && events.length === 0 && (
        <div className="flex flex-col items-center">
          <EmptyState
            icon={<Gift className="w-5 h-5" />}
            title="No events yet"
            message="Set a goal and a reward, for example: members who check in on 7 days this month get 200 XP and a protein shaker."
          />
          {createButton}
        </div>
      )}

      {events && events.length > 0 && today && (
        <ul className="space-y-3">
          {events.map(ev => {
            const status = STATUS[eventStatus(ev, today)]
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  onClick={() => setViewing(ev)}
                  className="w-full text-left p-4 bg-surface-secondary rounded-xl border border-surface-border hover:bg-slate-50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-bold text-slate-900 min-w-0 break-words">{ev.title}</p>
                    <Badge tone={status.tone}>{status.label}</Badge>
                  </div>
                  <p className="text-sm text-slate-700 mt-1">{goalSentence(ev)}</p>
                  <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
                    {dateRangeText(ev.startDate, ev.endDate, today)}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Reward: <span className="font-semibold text-slate-700">{rewardSentence(ev)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-2">
                    <span className="text-xs font-semibold text-slate-600 tabular-nums">
                      {ev.completionCount} completed
                    </span>
                    {ev.pendingRewardCount > 0 && (
                      <Badge tone="amber">
                        {ev.pendingRewardCount} {ev.pendingRewardCount === 1 ? 'reward' : 'rewards'} to hand over
                      </Badge>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <EventEditor
          event={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      )}
      {viewing && (
        <EventDetail
          // Always show the freshest copy of the event from the reloaded list.
          event={events?.find(e => e.id === viewing.id) ?? viewing}
          today={today ?? istToday()}
          onClose={() => setViewing(null)}
          onEdit={ev => {
            setViewing(null)
            setEditing(ev)
          }}
          onChanged={() => void reload()}
        />
      )}
    </Card>
  )
}

function EventDetail({
  event,
  today,
  onClose,
  onEdit,
  onChanged,
}: {
  event: OwnerEvent
  today: string
  onClose: () => void
  onEdit: (e: OwnerEvent) => void
  onChanged: () => void
}) {
  const [completions, setCompletions] = useState<Completion[] | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await api.get<{ data: { completions: Completion[] } }>(`/api/gamification/events/${event.id}`)
      setCompletions(res.data.completions)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [event.id])
  useEffect(() => {
    void load()
  }, [load])

  async function run(key: string, fn: () => Promise<void>) {
    if (busyKey) return
    setBusyKey(key)
    try {
      await fn()
    } catch (e) {
      toast.error(e instanceof GymFlowAPIError && e.code === 'NO_ITEM_REWARD' ? 'This event has no item reward.' : GENERIC_ERROR)
    } finally {
      setBusyKey(null)
    }
  }

  const give = (memberId: string) =>
    run(`give:${memberId}`, async () => {
      const res = await api.post<{ data: { rewardGivenAt: string } }>(
        `/api/gamification/events/${event.id}/give`,
        { memberId },
      )
      setCompletions(prev =>
        prev ? prev.map(c => (c.memberId === memberId ? { ...c, rewardGivenAt: res.data.rewardGivenAt } : c)) : prev,
      )
      toast.success('Marked as given')
      onChanged()
    })

  const togglePause = () =>
    run('pause', async () => {
      await api.patch(`/api/gamification/events/${event.id}`, { isActive: !event.isActive })
      toast.success(event.isActive ? 'Event paused' : 'Event resumed')
      onChanged()
    })

  const remove = () =>
    run('delete', async () => {
      const res = await api.delete<{ data: { mode: 'deleted' | 'deactivated' } }>(`/api/gamification/events/${event.id}`)
      toast.success(
        res.data.mode === 'deactivated'
          ? 'Members already completed this event, so it was paused instead of deleted. Their rewards are kept.'
          : 'Event deleted',
        { duration: 6000 },
      )
      onChanged()
      onClose()
    })

  const status = STATUS[eventStatus(event, today)]
  const dateOf = (iso: string) => formatEventDate(istDateOf(iso), today)

  return (
    <Modal
      title={event.title}
      description={goalSentence(event)}
      onClose={onClose}
      busy={busyKey !== null}
      footer={
        confirmDelete ? (
          <>
            <SecondaryButton onClick={() => setConfirmDelete(false)} disabled={busyKey !== null}>
              Keep event
            </SecondaryButton>
            <button
              type="button"
              onClick={remove}
              disabled={busyKey !== null}
              className="inline-flex items-center justify-center min-h-[40px] px-4 rounded-xl bg-red-600 text-white text-sm font-semibold hover:bg-red-700 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-60"
            >
              Yes, delete
            </button>
          </>
        ) : (
          <>
            <SecondaryButton onClick={() => setConfirmDelete(true)} disabled={busyKey !== null}>
              Delete
            </SecondaryButton>
            <SecondaryButton onClick={togglePause} disabled={busyKey !== null || status.label === 'Ended'}>
              {event.isActive ? 'Pause' : 'Resume'}
            </SecondaryButton>
            <PrimaryButton onClick={() => onEdit(event)} disabled={busyKey !== null}>
              Edit
            </PrimaryButton>
          </>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={status.tone}>{status.label}</Badge>
          <span className="text-xs text-slate-500 tabular-nums">{dateRangeText(event.startDate, event.endDate, today)}</span>
        </div>
        <p className="text-sm text-slate-700">
          Reward: <span className="font-semibold">{rewardSentence(event)}</span>
        </p>

        {confirmDelete && (
          <p role="alert" className="text-sm rounded-xl bg-red-50 text-red-700 p-3">
            Delete this event? If members have already completed it, it will only be paused so their rewards are kept.
          </p>
        )}

        <div>
          <h4 className="text-sm font-bold text-slate-900 mb-2">
            Completed by <span className="tabular-nums">{completions?.length ?? event.completionCount}</span>
          </h4>
          {loadError && (
            <div className="text-center py-3">
              <p className="text-sm text-slate-500 mb-2">We could not load the list.</p>
              <SecondaryButton onClick={() => void load()}>Try again</SecondaryButton>
            </div>
          )}
          {!loadError && completions === null && <p className="text-sm text-slate-500">Loading...</p>}
          {completions && completions.length === 0 && (
            <p className="text-sm text-slate-500">Nobody has completed this event yet.</p>
          )}
          {completions && completions.length > 0 && (
            <ul className="divide-y divide-surface-border">
              {completions.map(c => (
                <li key={c.memberId} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-900 truncate">{c.memberName}</p>
                    <p className="text-xs text-slate-500 tabular-nums">
                      Completed {dateOf(c.completedAt)}
                      {c.xpAwarded > 0 ? ` - ${c.xpAwarded.toLocaleString('en-IN')} XP added` : ''}
                    </p>
                    {c.rewardText && <p className="text-xs text-slate-600 mt-0.5">{c.rewardText}</p>}
                  </div>
                  {c.rewardText &&
                    (c.rewardGivenAt ? (
                      <span className="text-xs font-semibold text-emerald-700 text-right tabular-nums">
                        Given on {dateOf(c.rewardGivenAt)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => give(c.memberId)}
                        disabled={busyKey !== null}
                        aria-label={`Mark ${c.rewardText} as given to ${c.memberName}`}
                        className="flex-shrink-0 min-h-[40px] px-3 rounded-xl bg-brand-500 text-white text-xs font-semibold hover:bg-brand-600 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60"
                      >
                        {busyKey === `give:${c.memberId}` ? 'Saving...' : 'Mark as given'}
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Modal>
  )
}
