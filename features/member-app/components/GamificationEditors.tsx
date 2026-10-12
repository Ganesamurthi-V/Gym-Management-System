'use client'

/**
 * features/member-app/components/GamificationEditors.tsx
 *
 * The three configuration editors of the Gamification tab. Each is a thin form
 * over the pure helpers in ../utils/gamificationConfig.ts (which own the
 * parsing, bounds and messages) and hands a settings PATCH to `onSave`; the
 * panel owns the server call, the toast and the refresh.
 *
 * An editor is mounted only while it is open, so its form state starts from the
 * saved settings each time and a background refresh of the page cannot
 * overwrite what the owner is typing.
 */

import { useState } from 'react'
import { Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { SETTINGS_LIMITS } from '@/lib/gamification/constants'
import type { GamificationSettingsPatch } from '@/lib/gamification/settings'
import type { GamificationSettings, XpMultiplier } from '@/lib/gamification/types'
import {
  BADGE_CATEGORY_LABELS,
  EDITABLE_BADGES,
  EMPTY_MULTIPLIER_FORM,
  WEEKDAYS,
  achievementConfigToForm,
  badgeRulesToForm,
  describeMultiplier,
  multiplierToForm,
  parseAchievementConfigForm,
  parseBadgeForm,
  parseMultiplierForm,
  parseXpBaseForm,
  toggleWeekday,
  xpBaseToForm,
  type AchievementConfigForm,
  type BadgeForm,
  type FieldErrors,
  type MultiplierForm,
  type XpBaseForm,
} from '../utils/gamificationConfig'
import Modal, { Field, PrimaryButton, SecondaryButton, fieldDescribedBy, inputClass } from './Modal'

export interface EditorProps {
  settings: GamificationSettings
  /** Resolves true when the patch was saved (the editor then closes). */
  onSave: (patch: GamificationSettingsPatch) => Promise<boolean>
  onClose: () => void
  saving: boolean
}

// ─── XP Multipliers ──────────────────────────────────────────────────────────

const XP_FIELDS: Array<{ key: keyof XpBaseForm; label: string; limit: { min: number; max: number } }> = [
  { key: 'xpPerCheckin', label: 'XP per check-in day', limit: SETTINGS_LIMITS.xpPerCheckin },
  { key: 'xpPerRenewal', label: 'XP per membership renewal', limit: SETTINGS_LIMITS.xpPerRenewal },
  { key: 'xpPortalActivation', label: 'XP for activating the member app', limit: SETTINGS_LIMITS.xpPortalActivation },
]

export function XpMultipliersEditor({ settings, onSave, onClose, saving }: EditorProps) {
  const [base, setBase] = useState<XpBaseForm>(() => xpBaseToForm(settings))
  const [rules, setRules] = useState<XpMultiplier[]>(() => settings.xpMultipliers)
  const [errors, setErrors] = useState<FieldErrors>({})

  // The rule being added (index null) or edited. While set, the sheet shows the
  // rule form instead of the list: one screen at a time fits a phone, where a
  // dialog stacked on a dialog does not.
  const [draft, setDraft] = useState<{ index: number | null; form: MultiplierForm } | null>(null)
  const [draftErrors, setDraftErrors] = useState<FieldErrors>({})

  const atLimit = rules.length >= SETTINGS_LIMITS.maxMultipliers

  function openDraft(index: number | null) {
    setDraftErrors({})
    setDraft({ index, form: index === null ? EMPTY_MULTIPLIER_FORM : multiplierToForm(rules[index]) })
  }

  function commitDraft() {
    if (!draft) return
    const parsed = parseMultiplierForm(draft.form)
    if (!parsed.ok) {
      setDraftErrors(parsed.errors)
      return
    }
    setRules(prev =>
      draft.index === null ? [...prev, parsed.value] : prev.map((r, i) => (i === draft.index ? parsed.value : r)),
    )
    setDraft(null)
  }

  async function save() {
    const parsed = parseXpBaseForm(base)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    if (await onSave({ ...parsed.value, xpMultipliers: rules })) onClose()
  }

  if (draft) {
    const { form } = draft
    const setForm = (next: Partial<MultiplierForm>) => setDraft({ ...draft, form: { ...form, ...next } })

    return (
      <Modal
        title={draft.index === null ? 'Add bonus rule' : 'Edit bonus rule'}
        description="Multiplies check-in XP on the days it applies."
        onClose={() => setDraft(null)}
        footer={
          <>
            <SecondaryButton onClick={() => setDraft(null)}>Back</SecondaryButton>
            <PrimaryButton onClick={commitDraft}>{draft.index === null ? 'Add rule' : 'Update rule'}</PrimaryButton>
          </>
        }
      >
        <div className="space-y-4">
          <Field id="bonus-label" label="Name" hint='For example "Monday boost" or "Diwali week".' error={draftErrors.label}>
            <input
              id="bonus-label"
              type="text"
              value={form.label}
              maxLength={SETTINGS_LIMITS.multiplierLabelMax}
              onChange={e => setForm({ label: e.target.value })}
              aria-invalid={Boolean(draftErrors.label)}
              aria-describedby={fieldDescribedBy('bonus-label', 'hint', draftErrors.label)}
              className={inputClass}
            />
          </Field>

          <Field
            id="bonus-factor"
            label="Multiplier"
            hint={`${SETTINGS_LIMITS.multiplierFactor.min} to ${SETTINGS_LIMITS.multiplierFactor.max}. 2 means double XP.`}
            error={draftErrors.factor}
          >
            <input
              id="bonus-factor"
              type="number"
              inputMode="decimal"
              step="0.25"
              min={SETTINGS_LIMITS.multiplierFactor.min}
              max={SETTINGS_LIMITS.multiplierFactor.max}
              value={form.factor}
              onChange={e => setForm({ factor: e.target.value })}
              aria-invalid={Boolean(draftErrors.factor)}
              aria-describedby={fieldDescribedBy('bonus-factor', 'hint', draftErrors.factor)}
              className={inputClass}
            />
          </Field>

          <fieldset>
            <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Days of the week</legend>
            <div className="flex flex-wrap gap-1.5">
              {WEEKDAYS.map(day => {
                const active = form.days.includes(day.value)
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={active}
                    aria-label={day.long}
                    onClick={() => setForm({ days: toggleWeekday(form.days, day.value) })}
                    className={`min-w-[44px] min-h-[40px] rounded-xl px-2.5 text-sm font-semibold border transition-colors ${
                      active
                        ? 'bg-brand-50 text-brand-700 border-brand-200'
                        : 'bg-surface text-slate-600 border-surface-border hover:bg-surface-secondary'
                    }`}
                  >
                    {day.short}
                  </button>
                )
              })}
            </div>
            <p className="text-xs text-slate-500 mt-1.5">
              {form.days.length === 0 ? 'No day selected: the bonus applies every day.' : 'Applies only on the selected days.'}
            </p>
            {draftErrors.daysOfWeek && (
              <p role="alert" className="text-xs font-medium text-red-600 mt-1">{draftErrors.daysOfWeek}</p>
            )}
          </fieldset>

          <div className="grid grid-cols-1 xs:grid-cols-2 gap-3">
            <Field id="bonus-start" label="Starts on (optional)" error={draftErrors.startDate}>
              <input
                id="bonus-start"
                type="date"
                value={form.startDate}
                onChange={e => setForm({ startDate: e.target.value })}
                aria-invalid={Boolean(draftErrors.startDate)}
                aria-describedby={fieldDescribedBy('bonus-start', undefined, draftErrors.startDate)}
                className={inputClass}
              />
            </Field>
            <Field id="bonus-end" label="Ends on (optional)" error={draftErrors.endDate}>
              <input
                id="bonus-end"
                type="date"
                value={form.endDate}
                min={form.startDate || undefined}
                onChange={e => setForm({ endDate: e.target.value })}
                aria-invalid={Boolean(draftErrors.endDate)}
                aria-describedby={fieldDescribedBy('bonus-end', undefined, draftErrors.endDate)}
                className={inputClass}
              />
            </Field>
          </div>
          <p className="text-xs text-slate-500">Leave both dates empty to keep the bonus running with no end.</p>
        </div>
      </Modal>
    )
  }

  return (
    <Modal
      title="XP Multipliers"
      description="How much XP members earn, and bonus days that multiply it."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} busy={saving}>Save</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="space-y-4">
          {XP_FIELDS.map(({ key, label, limit }) => {
            const id = `xp-${key}`
            const hint = `${limit.min} to ${limit.max}`
            return (
              <Field key={key} id={id} label={label} hint={hint} error={errors[key]}>
                <input
                  id={id}
                  type="number"
                  inputMode="numeric"
                  min={limit.min}
                  max={limit.max}
                  step={1}
                  value={base[key]}
                  onChange={e => setBase(prev => ({ ...prev, [key]: e.target.value }))}
                  aria-invalid={Boolean(errors[key])}
                  aria-describedby={fieldDescribedBy(id, hint, errors[key])}
                  className={inputClass}
                />
              </Field>
            )
          })}
          <p className="text-xs text-slate-500">
            A member earns check-in XP once per day, however many sessions they attend that day.
          </p>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3 mb-2">
            <h4 className="text-sm font-bold text-slate-900">Bonus rules</h4>
            <button
              type="button"
              onClick={() => openDraft(null)}
              disabled={atLimit}
              className="inline-flex items-center gap-1 min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              Add bonus rule
            </button>
          </div>

          {rules.length === 0 ? (
            <p className="text-sm text-slate-500 bg-surface-secondary border border-surface-border rounded-xl px-3 py-3">
              No bonus rules yet. Add one to give double XP on a slow day or during a festival week.
            </p>
          ) : (
            <ul className="space-y-2">
              {rules.map((rule, index) => (
                <li
                  key={`${rule.label}-${index}`}
                  className="flex items-center gap-2 bg-surface-secondary border border-surface-border rounded-xl pl-3 pr-1.5 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900 truncate">{rule.label}</p>
                    <p className="text-xs text-slate-500">{describeMultiplier(rule)}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openDraft(index)}
                    aria-label={`Edit ${rule.label}`}
                    className="w-9 h-9 flex flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setRules(prev => prev.filter((_, i) => i !== index))}
                    aria-label={`Remove ${rule.label}`}
                    className="w-9 h-9 flex flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <p className="text-xs text-slate-500 mt-2">
            {atLimit
              ? `You have reached the limit of ${SETTINGS_LIMITS.maxMultipliers} bonus rules.`
              : 'When two rules apply on the same day, the higher one is used. They do not add up.'}
          </p>
        </div>
      </div>
    </Modal>
  )
}

// ─── Badge Rules ─────────────────────────────────────────────────────────────

/** Editable badges grouped by category, in definition order. */
const BADGE_GROUPS = (() => {
  const groups: Array<{ category: string; label: string; badges: typeof EDITABLE_BADGES[number][] }> = []
  for (const badge of EDITABLE_BADGES) {
    let group = groups.find(g => g.category === badge.category)
    if (!group) {
      group = { category: badge.category, label: BADGE_CATEGORY_LABELS[badge.category], badges: [] }
      groups.push(group)
    }
    group.badges.push(badge)
  }
  return groups
})()

export function BadgeRulesEditor({ settings, onSave, onClose, saving }: EditorProps) {
  const [form, setForm] = useState<BadgeForm>(() => badgeRulesToForm(settings.badgeRules))
  const [errors, setErrors] = useState<FieldErrors>({})

  const anyCustom = EDITABLE_BADGES.some(badge => form[badge.code] !== String(badge.defaultThreshold))

  async function save() {
    const parsed = parseBadgeForm(form)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    if (await onSave({ badgeRules: parsed.value })) onClose()
  }

  return (
    <Modal
      title="Badge Rules"
      description="Change what it takes to unlock each badge."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} busy={saving}>Save</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-slate-500">Badges a member has already unlocked stay unlocked.</p>
          <button
            type="button"
            onClick={() => {
              setForm(badgeRulesToForm({}))
              setErrors({})
            }}
            disabled={!anyCustom}
            className="inline-flex flex-shrink-0 items-center gap-1 min-h-[36px] px-2.5 rounded-lg text-xs font-semibold text-brand-600 hover:bg-brand-50 transition-colors disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Reset all
          </button>
        </div>

        {BADGE_GROUPS.map(group => (
          <section key={group.category} aria-label={group.label}>
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">{group.label}</h4>
            <ul className="space-y-2">
              {group.badges.map(badge => {
                const id = `badge-${badge.code}`
                const value = form[badge.code] ?? ''
                const isDefault = value === String(badge.defaultThreshold)
                const error = errors[badge.code]
                const hint = `Default: ${badge.defaultThreshold.toLocaleString('en-IN')} ${badge.unit}`
                return (
                  <li key={badge.code} className="bg-surface-secondary border border-surface-border rounded-xl px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="min-w-0 flex-1">
                        <label htmlFor={id} className="block text-sm font-semibold text-slate-900 truncate">
                          {badge.name}
                        </label>
                        <p id={`${id}-hint`} className="text-xs text-slate-500">{hint}</p>
                      </div>
                      <input
                        id={id}
                        type="number"
                        inputMode="numeric"
                        min={badge.min}
                        max={badge.max}
                        step={1}
                        value={value}
                        placeholder={String(badge.defaultThreshold)}
                        onChange={e => setForm(prev => ({ ...prev, [badge.code]: e.target.value }))}
                        aria-invalid={Boolean(error)}
                        aria-describedby={error ? `${id}-error` : `${id}-hint`}
                        className={`${inputClass} !w-24 text-right`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setForm(prev => ({ ...prev, [badge.code]: String(badge.defaultThreshold) }))
                          setErrors(prev => {
                            const { [badge.code]: _removed, ...rest } = prev
                            return rest
                          })
                        }}
                        disabled={isDefault}
                        aria-label={`Reset ${badge.name} to default`}
                        title="Reset to default"
                        className="w-9 h-9 flex flex-shrink-0 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800 transition-colors disabled:opacity-30"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                    {error && (
                      <p id={`${id}-error`} role="alert" className="text-xs font-medium text-red-600 mt-1.5">
                        {error}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </section>
        ))}
      </div>
    </Modal>
  )
}

// ─── Achievement Config ──────────────────────────────────────────────────────

const GOAL_OPTIONS = Array.from(
  { length: SETTINGS_LIMITS.weeklyGoalDays.max - SETTINGS_LIMITS.weeklyGoalDays.min + 1 },
  (_, i) => SETTINGS_LIMITS.weeklyGoalDays.min + i,
)

export function AchievementConfigEditor({ settings, onSave, onClose, saving }: EditorProps) {
  const [form, setForm] = useState<AchievementConfigForm>(() => achievementConfigToForm(settings))
  const [errors, setErrors] = useState<FieldErrors>({})

  async function save() {
    const parsed = parseAchievementConfigForm(form)
    if (!parsed.ok) {
      setErrors(parsed.errors)
      return
    }
    setErrors({})
    if (await onSave(parsed.value)) onClose()
  }

  const prizeFields = [
    { key: 'weeklyPrize' as const, label: 'Prize for the last 7 days leader (optional)', placeholder: 'e.g. Free protein shake' },
    { key: 'monthlyPrize' as const, label: 'Prize for the last 30 days leader (optional)', placeholder: 'e.g. One month free' },
  ]

  return (
    <Modal
      title="Achievement Config"
      description="The weekly goal members aim for, and prizes for your leaders."
      onClose={onClose}
      busy={saving}
      footer={
        <>
          <SecondaryButton onClick={onClose} disabled={saving}>Cancel</SecondaryButton>
          <PrimaryButton onClick={save} busy={saving}>Save</PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        <fieldset>
          <legend className="block text-xs font-semibold text-slate-600 mb-1.5">Weekly goal (days per week)</legend>
          <div role="radiogroup" aria-label="Weekly goal in days" className="flex flex-wrap gap-1.5">
            {GOAL_OPTIONS.map(days => {
              const active = form.weeklyGoalDays === days
              return (
                <button
                  key={days}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${days} ${days === 1 ? 'day' : 'days'}`}
                  onClick={() => setForm(prev => ({ ...prev, weeklyGoalDays: days }))}
                  className={`w-11 h-11 rounded-xl text-sm font-bold border transition-colors ${
                    active
                      ? 'bg-brand-500 text-white border-brand-500'
                      : 'bg-surface text-slate-600 border-surface-border hover:bg-surface-secondary'
                  }`}
                >
                  {days}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-slate-500 mt-1.5">
            Members see their progress toward this many check-in days in the last 7 days.
          </p>
          {errors.weeklyGoalDays && (
            <p role="alert" className="text-xs font-medium text-red-600 mt-1">{errors.weeklyGoalDays}</p>
          )}
        </fieldset>

        {prizeFields.map(({ key, label, placeholder }) => {
          const id = `prize-${key}`
          const hint = `${form[key].length}/${SETTINGS_LIMITS.prizeMax} characters. Leave empty for no prize.`
          return (
            <Field key={key} id={id} label={label} hint={hint} error={errors[key]}>
              <input
                id={id}
                type="text"
                value={form[key]}
                maxLength={SETTINGS_LIMITS.prizeMax}
                placeholder={placeholder}
                onChange={e => setForm(prev => ({ ...prev, [key]: e.target.value }))}
                aria-invalid={Boolean(errors[key])}
                aria-describedby={fieldDescribedBy(id, hint, errors[key])}
                className={inputClass}
              />
            </Field>
          )
        })}
      </div>
    </Modal>
  )
}
