'use client'

import { useMemo, useState } from 'react'
import { toast } from 'react-hot-toast'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { EVENT_LIMITS } from '@/lib/gamification/constants'
import {
  createEventSchema,
  type CreateEventInput,
  type EventGoalType,
  type EventSessionFilter,
} from '@/lib/gamification/events'
import { previewSentence } from '@/lib/gamification/eventCopy'
import { addDays, istToday } from '@/lib/gamification/periods'
import type { OwnerEvent } from '../hooks/useGymEvents'
import Modal, { Field, PrimaryButton, SecondaryButton, fieldDescribedBy, inputClass } from './Modal'

const GOALS: Array<{ id: EventGoalType; title: string; help: string }> = [
  { id: 'checkin_days', title: 'Check in on X days', help: 'Counts each day a member comes to the gym.' },
  { id: 'streak_days', title: 'Keep an X-day streak', help: 'Members must come on X days in a row.' },
  { id: 'long_sessions', title: 'Long workouts', help: 'Members stay at least a set time, on X days.' },
]

const TARGET_LABEL: Record<EventGoalType, string> = {
  checkin_days: 'Number of days to check in',
  streak_days: 'Streak length (days in a row)',
  long_sessions: 'Number of long workout days',
}

const PRESETS = [60, 90, 120]

type Filter = 'any' | EventSessionFilter

/** Turns a failed request into words an owner can act on. */
function friendlyError(err: unknown): string {
  if (err instanceof GymFlowAPIError) {
    if (err.code === 'EVENT_LIMIT') {
      return `You can have at most ${EVENT_LIMITS.maxActiveEvents} active events. Pause or delete one first.`
    }
    if (err.code === 'EVENT_LOCKED') {
      return 'Members have already completed this event, so its goal and start date cannot change. End it and create a new one.'
    }
    if (err.code === 'VALIDATION_ERROR') return err.message
    if (err.code === 'NETWORK_ERROR') return 'No connection. Check your internet and try again.'
  }
  return 'We could not save the event. Please try again.'
}

const NUMBER_RANGES: Record<string, [number, number]> = {
  goalTarget: [EVENT_LIMITS.goalTarget.min, EVENT_LIMITS.goalTarget.max],
  minSessionMinutes: [EVENT_LIMITS.minSessionMinutes.min, EVENT_LIMITS.minSessionMinutes.max],
  rewardXp: [EVENT_LIMITS.rewardXp.min, EVENT_LIMITS.rewardXp.max],
}

const toInt = (s: string) => (s.trim() === '' ? Number.NaN : Number(s))

export default function EventEditor({
  event,
  onClose,
  onSaved,
}: {
  /** Present when editing. */
  event?: OwnerEvent
  onClose: () => void
  onSaved: () => void
}) {
  const today = istToday()
  const locked = (event?.completionCount ?? 0) > 0

  const [title, setTitle] = useState(event?.title ?? '')
  const [description, setDescription] = useState(event?.description ?? '')
  const [goalType, setGoalType] = useState<EventGoalType>(event?.goalType ?? 'checkin_days')
  const [goalTarget, setGoalTarget] = useState(String(event?.goalTarget ?? 7))
  const [minutes, setMinutes] = useState(String(event?.minSessionMinutes ?? 90))
  const [filter, setFilter] = useState<Filter>(event?.sessionFilter ?? 'any')
  const [startDate, setStartDate] = useState(event?.startDate ?? today)
  const [endDate, setEndDate] = useState(event?.endDate ?? addDays(today, 14))
  const [rewardXp, setRewardXp] = useState(String(event?.rewardXp ?? 0))
  const [rewardText, setRewardText] = useState(event?.rewardText ?? '')
  const [customMinutes, setCustomMinutes] = useState(
    event?.minSessionMinutes != null && !PRESETS.includes(event.minSessionMinutes),
  )
  const [showErrors, setShowErrors] = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const candidate = useMemo(
    () => ({
      title,
      description,
      goalType,
      goalTarget: toInt(goalTarget),
      minSessionMinutes: goalType === 'long_sessions' ? toInt(minutes) : null,
      sessionFilter: goalType === 'streak_days' || filter === 'any' ? null : filter,
      startDate,
      endDate,
      rewardXp: rewardXp.trim() === '' ? 0 : toInt(rewardXp),
      rewardText,
      isActive: event?.isActive ?? true,
    }),
    [title, description, goalType, goalTarget, minutes, filter, startDate, endDate, rewardXp, rewardText, event],
  )

  const parsed = useMemo(() => createEventSchema.safeParse(candidate), [candidate])

  const errors = useMemo(() => {
    const out: Record<string, string> = {}
    if (parsed.success) return out
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (!key || out[key]) continue
      const range = NUMBER_RANGES[key]
      out[key] =
        issue.code === 'invalid_type'
          ? 'Enter a number'
          : range && (issue.code === 'too_small' || issue.code === 'too_big')
            ? `Enter a number from ${range[0]} to ${range[1]}`
            : issue.message
    }
    return out
  }, [parsed])

  const err = (k: string) => (showErrors ? errors[k] : undefined)

  async function save() {
    setServerError(null)
    if (!parsed.success) {
      setShowErrors(true)
      return
    }
    setSaving(true)
    try {
      let newCompletions = 0
      if (event) {
        // Send only what changed: locked fields that did not change must not be
        // in the body, and the server re-validates the merge with the stored row.
        const data = parsed.data
        const patch: Record<string, unknown> = {}
        for (const key of Object.keys(data) as Array<keyof CreateEventInput>) {
          if (data[key] !== event[key]) patch[key] = data[key]
        }
        if (Object.keys(patch).length === 0) {
          onClose()
          return
        }
        const res = await api.patch<{ data: { newCompletions: number } }>(
          `/api/gamification/events/${event.id}`,
          patch,
        )
        newCompletions = res.data.newCompletions
      } else {
        const res = await api.post<{ data: { newCompletions: number } }>(
          '/api/gamification/events',
          parsed.data,
        )
        newCompletions = res.data.newCompletions
      }
      toast.success(event ? 'Event saved' : 'Event created')
      if (newCompletions > 0) {
        toast(`${newCompletions} ${newCompletions === 1 ? 'member has' : 'members have'} already completed it`)
      }
      onSaved()
      onClose()
    } catch (e) {
      setServerError(friendlyError(e))
    } finally {
      setSaving(false)
    }
  }

  const preview = parsed.success
    ? previewSentence(parsed.data, today)
    : 'Fill in the details above to see how members will read this event.'

  const lockNote = locked ? (
    <p className="text-xs text-amber-700 mt-1">Locked because members already completed this event.</p>
  ) : null

  return (
    <Modal
      title={event ? 'Edit event' : 'Create event'}
      description="A challenge members can complete for a reward."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>
            Cancel
          </SecondaryButton>
          <PrimaryButton onClick={save} busy={saving}>
            {event ? 'Save changes' : 'Create event'}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-4">
        <Field id="ev-title" label="Event name" error={err('title')} hint={`${title.length}/${EVENT_LIMITS.titleMax}`}>
          <input
            id="ev-title"
            className={inputClass}
            value={title}
            maxLength={EVENT_LIMITS.titleMax}
            onChange={e => setTitle(e.target.value)}
            placeholder="Diwali 7-day challenge"
            aria-invalid={Boolean(err('title'))}
            aria-describedby={fieldDescribedBy('ev-title', `${title.length}/${EVENT_LIMITS.titleMax}`, err('title'))}
          />
        </Field>

        <Field id="ev-desc" label="Short note for members (optional)" error={err('description')}>
          <input
            id="ev-desc"
            className={inputClass}
            value={description}
            maxLength={EVENT_LIMITS.descriptionMax}
            onChange={e => setDescription(e.target.value)}
            aria-invalid={Boolean(err('description'))}
            aria-describedby={fieldDescribedBy('ev-desc', undefined, err('description'))}
          />
        </Field>

        <fieldset disabled={locked} className="min-w-0">
          <legend className="block text-xs font-semibold text-slate-600 mb-1.5">What should members do?</legend>
          <div role="radiogroup" aria-label="Goal" className="grid gap-2">
            {GOALS.map(g => {
              const on = goalType === g.id
              return (
                <button
                  key={g.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setGoalType(g.id)}
                  className={`text-left min-h-[56px] px-3 py-2.5 rounded-xl border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 ${
                    on ? 'border-brand-500 bg-brand-50' : 'border-surface-border bg-surface hover:bg-surface-secondary'
                  }`}
                >
                  <span className="block text-sm font-bold text-slate-900">{g.title}</span>
                  <span className="block text-xs text-slate-500 mt-0.5">{g.help}</span>
                </button>
              )
            })}
          </div>
          {lockNote}
        </fieldset>

        <Field id="ev-target" label={TARGET_LABEL[goalType]} error={err('goalTarget')}>
          <input
            id="ev-target"
            type="number"
            inputMode="numeric"
            className={`${inputClass} tabular-nums`}
            value={goalTarget}
            min={EVENT_LIMITS.goalTarget.min}
            max={EVENT_LIMITS.goalTarget.max}
            disabled={locked}
            onChange={e => setGoalTarget(e.target.value)}
            aria-invalid={Boolean(err('goalTarget'))}
            aria-describedby={fieldDescribedBy('ev-target', undefined, err('goalTarget'))}
          />
        </Field>

        {goalType === 'long_sessions' && (
          <fieldset disabled={locked} className="min-w-0">
            <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Stay at least</legend>
            <div className="flex flex-wrap gap-2">
              {PRESETS.map(p => {
                const on = !customMinutes && Number(minutes) === p
                return (
                  <button
                    key={p}
                    type="button"
                    aria-pressed={on}
                    onClick={() => {
                      setCustomMinutes(false)
                      setMinutes(String(p))
                    }}
                    className={`min-h-[40px] px-4 rounded-xl border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 ${
                      on ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-surface text-slate-700'
                    }`}
                  >
                    {p === 60 ? '1 hour' : p === 90 ? '1.5 hours' : '2 hours'}
                  </button>
                )
              })}
              <button
                type="button"
                aria-pressed={customMinutes}
                onClick={() => setCustomMinutes(true)}
                className={`min-h-[40px] px-4 rounded-xl border text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 ${
                  customMinutes ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-surface text-slate-700'
                }`}
              >
                Other
              </button>
            </div>
            {customMinutes && (
              <div className="mt-2">
                <Field id="ev-minutes" label="Minutes" error={err('minSessionMinutes')}>
                  <input
                    id="ev-minutes"
                    type="number"
                    inputMode="numeric"
                    className={`${inputClass} tabular-nums`}
                    value={minutes}
                    min={EVENT_LIMITS.minSessionMinutes.min}
                    max={EVENT_LIMITS.minSessionMinutes.max}
                    onChange={e => setMinutes(e.target.value)}
                    aria-invalid={Boolean(err('minSessionMinutes'))}
                    aria-describedby={fieldDescribedBy('ev-minutes', undefined, err('minSessionMinutes'))}
                  />
                </Field>
              </div>
            )}
            {!customMinutes && err('minSessionMinutes') && (
              <p role="alert" className="text-xs font-medium text-red-600 mt-1">{err('minSessionMinutes')}</p>
            )}
            <p className="text-xs text-slate-500 mt-1.5">
              Only counts when the member is checked out, so make sure check-outs are recorded.
            </p>
            {lockNote}
          </fieldset>
        )}

        {goalType !== 'streak_days' && (
          <fieldset disabled={locked} className="min-w-0">
            <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Which sessions count?</legend>
            <div role="radiogroup" aria-label="Session" className="grid grid-cols-3 gap-2">
              {(['any', 'morning', 'evening'] as const).map(f => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={filter === f}
                  onClick={() => setFilter(f)}
                  className={`min-h-[40px] rounded-xl border text-sm font-semibold capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/40 disabled:opacity-60 ${
                    filter === f ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-surface-border bg-surface text-slate-700'
                  }`}
                >
                  {f === 'any' ? 'Any time' : f}
                </button>
              ))}
            </div>
            {lockNote}
          </fieldset>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Field id="ev-start" label="Starts" error={err('startDate')}>
            <input
              id="ev-start"
              type="date"
              className={`${inputClass} tabular-nums`}
              value={startDate}
              disabled={locked}
              onChange={e => setStartDate(e.target.value)}
              aria-invalid={Boolean(err('startDate'))}
              aria-describedby={fieldDescribedBy('ev-start', undefined, err('startDate'))}
            />
          </Field>
          <Field id="ev-end" label="Ends (last day)" error={err('endDate')}>
            <input
              id="ev-end"
              type="date"
              className={`${inputClass} tabular-nums`}
              value={endDate}
              min={startDate}
              onChange={e => setEndDate(e.target.value)}
              aria-invalid={Boolean(err('endDate'))}
              aria-describedby={fieldDescribedBy('ev-end', undefined, err('endDate'))}
            />
          </Field>
        </div>
        {locked && <p className="text-xs text-amber-700 -mt-2">The start date is locked. You can still extend the end date.</p>}

        <div className="rounded-xl border border-surface-border bg-surface-secondary p-3 space-y-3">
          <div>
            <p className="text-sm font-bold text-slate-900">Reward</p>
            <p className="text-xs text-slate-500">Give bonus XP, an item, or both. At least one is needed.</p>
          </div>
          <Field id="ev-xp" label="Bonus XP (0 for none)" error={err('rewardXp')}>
            <input
              id="ev-xp"
              type="number"
              inputMode="numeric"
              className={`${inputClass} tabular-nums`}
              value={rewardXp}
              min={EVENT_LIMITS.rewardXp.min}
              max={EVENT_LIMITS.rewardXp.max}
              onChange={e => setRewardXp(e.target.value)}
              aria-invalid={Boolean(err('rewardXp'))}
              aria-describedby={fieldDescribedBy('ev-xp', undefined, err('rewardXp'))}
            />
          </Field>
          <Field id="ev-item" label="Item reward (optional)" error={err('rewardText')}>
            <input
              id="ev-item"
              className={inputClass}
              value={rewardText}
              maxLength={EVENT_LIMITS.rewardTextMax}
              onChange={e => setRewardText(e.target.value)}
              placeholder="Protein shaker"
              aria-invalid={Boolean(err('rewardText'))}
              aria-describedby={fieldDescribedBy('ev-item', undefined, err('rewardText'))}
            />
          </Field>
          {event && (
            <p className="text-xs text-slate-500">
              Changing the reward only affects members who complete the event from now on.
            </p>
          )}
        </div>

        <p className="rounded-xl bg-brand-50 text-brand-700 text-sm font-medium p-3" aria-live="polite">
          {preview}
        </p>

        {serverError && (
          <p role="alert" className="text-sm font-medium text-red-600">
            {serverError}
          </p>
        )}
      </div>
    </Modal>
  )
}
