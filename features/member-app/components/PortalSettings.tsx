'use client'

import { useState } from 'react'
import { Loader2, Save, Upload } from 'lucide-react'
import type {
  InvitationExpiry, PortalLanguage, PortalSettingsData,
} from '@/types/member-app'
import { saveSettings } from '@/app/member-app/actions'
import { useAsyncAction, useComingSoon } from '../hooks/useMemberAppActions'
import { Card, SectionHeader } from './ui'

const EXPIRY_OPTIONS: Array<{ value: InvitationExpiry; label: string }> = [
  { value: '24h', label: '24 hours' },
  { value: '48h', label: '48 hours' },
  { value: '7d',  label: '7 days' },
  { value: '30d', label: '30 days' },
]

const LANGUAGE_OPTIONS: Array<{ value: PortalLanguage; label: string }> = [
  { value: 'en', label: 'English' },
  { value: 'ta', label: 'Tamil' },
  { value: 'hi', label: 'Hindi' },
]

const TIMEZONE_OPTIONS = [
  { value: 'Asia/Kolkata', label: 'India Standard Time (IST)' },
  { value: 'Asia/Dubai',   label: 'Gulf Standard Time (GST)' },
  { value: 'UTC',          label: 'Coordinated Universal Time (UTC)' },
]

const INPUT_CLASS =
  'w-full px-3 py-2 bg-white border border-surface-border rounded-xl text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type Errors = Partial<Record<keyof PortalSettingsData, string>>

function Field({
  label, htmlFor, error, hint, children,
}: {
  label: string
  htmlFor: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2"
      >
        {label}
      </label>
      {children}
      {error
        ? <p className="text-xs text-red-600 mt-1.5 font-medium">{error}</p>
        : hint && <p className="text-xs text-slate-400 mt-1.5">{hint}</p>}
    </div>
  )
}

/** Optional URL fields must either be blank or parse as absolute URLs. */
function isValidOptionalUrl(value: string): boolean {
  if (!value.trim()) return true
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export default function PortalSettings({
  settings: initialSettings,
}: {
  gymId: string
  settings: PortalSettingsData
}) {
  const [form, setForm] = useState(initialSettings)
  const [errors, setErrors] = useState<Errors>({})
  const { run, isPending, isBusy } = useAsyncAction()
  const comingSoon = useComingSoon()

  function update<K extends keyof PortalSettingsData>(key: K, value: PortalSettingsData[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => (prev[key] ? { ...prev, [key]: undefined } : prev))
  }

  function validate(): Errors {
    const next: Errors = {}
    const name = form.portalName.trim()

    if (!name) next.portalName = 'Portal name is required'
    else if (name.length > 60) next.portalName = 'Portal name must be 60 characters or fewer'

    if (!form.supportEmail.trim()) next.supportEmail = 'Support email is required'
    else if (!EMAIL_RE.test(form.supportEmail.trim())) next.supportEmail = 'Enter a valid email address'

    if (!isValidOptionalUrl(form.privacyPolicyUrl)) next.privacyPolicyUrl = 'Enter a valid http(s) URL'
    if (!isValidOptionalUrl(form.termsUrl)) next.termsUrl = 'Enter a valid http(s) URL'
    if (!isValidOptionalUrl(form.brandLogoUrl)) next.brandLogoUrl = 'Enter a valid http(s) URL'

    return next
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found = validate()
    setErrors(found)
    if (Object.keys(found).length > 0) return

    await run('save_settings', () => saveSettings(form))
  }

  return (
    <Card>
      <SectionHeader
        title="Member App Settings"
        description="Branding, support contacts and portal defaults."
      />

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Portal Name" htmlFor="portalName" error={errors.portalName}>
            <input
              id="portalName"
              type="text"
              maxLength={80}
              value={form.portalName}
              onChange={e => update('portalName', e.target.value)}
              className={INPUT_CLASS}
              placeholder="Iron Temple Member App"
              required
            />
          </Field>

          <Field
            label="Brand Logo URL"
            htmlFor="brandLogoUrl"
            error={errors.brandLogoUrl}
            hint="Optional. Paste a hosted image URL or upload a file."
          >
            <div className="flex gap-2">
              <input
                id="brandLogoUrl"
                type="text"
                value={form.brandLogoUrl}
                onChange={e => update('brandLogoUrl', e.target.value)}
                className={INPUT_CLASS}
                placeholder="https://cdn.example.com/logo.png"
              />
              <button
                type="button"
                onClick={() => comingSoon('Logo upload')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-white border border-surface-border text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-50 transition-colors flex-shrink-0"
              >
                <Upload className="w-3.5 h-3.5" />
                Upload
              </button>
            </div>
          </Field>

          <Field label="Primary Colour" htmlFor="primaryColour" hint="Used for buttons and highlights in the member app.">
            <div className="flex items-center gap-3">
              <input
                id="primaryColour"
                type="color"
                value={form.primaryColour}
                onChange={e => update('primaryColour', e.target.value)}
                className="h-10 w-16 rounded-xl border border-surface-border bg-white p-1 cursor-pointer"
              />
              <span className="text-sm font-mono text-slate-600">{form.primaryColour}</span>
            </div>
          </Field>

          <Field label="Support Email" htmlFor="supportEmail" error={errors.supportEmail}>
            <input
              id="supportEmail"
              type="email"
              value={form.supportEmail}
              onChange={e => update('supportEmail', e.target.value)}
              className={INPUT_CLASS}
              placeholder="support@yourgym.com"
              required
            />
          </Field>

          <Field label="Support Phone" htmlFor="supportPhone" hint="Optional.">
            <input
              id="supportPhone"
              type="tel"
              value={form.supportPhone}
              onChange={e => update('supportPhone', e.target.value)}
              className={INPUT_CLASS}
              placeholder="+91 98400 00000"
            />
          </Field>

          <Field label="Privacy Policy URL" htmlFor="privacyPolicyUrl" error={errors.privacyPolicyUrl} hint="Optional.">
            <input
              id="privacyPolicyUrl"
              type="url"
              value={form.privacyPolicyUrl}
              onChange={e => update('privacyPolicyUrl', e.target.value)}
              className={INPUT_CLASS}
              placeholder="https://yourgym.com/privacy"
            />
          </Field>

          <Field label="Terms & Conditions URL" htmlFor="termsUrl" error={errors.termsUrl} hint="Optional.">
            <input
              id="termsUrl"
              type="url"
              value={form.termsUrl}
              onChange={e => update('termsUrl', e.target.value)}
              className={INPUT_CLASS}
              placeholder="https://yourgym.com/terms"
            />
          </Field>

          <Field label="Member App URL" htmlFor="memberAppUrl" hint="Derived from your gym name. Contact support to change it.">
            <input
              id="memberAppUrl"
              type="text"
              value={form.memberAppUrl}
              readOnly
              aria-readonly="true"
              className={`${INPUT_CLASS} bg-slate-50 text-slate-500 cursor-not-allowed`}
            />
          </Field>

          <Field label="Invitation Expiry" htmlFor="invitationExpiry">
            <select
              id="invitationExpiry"
              value={form.invitationExpiry}
              onChange={e => update('invitationExpiry', e.target.value as InvitationExpiry)}
              className={INPUT_CLASS}
              required
            >
              {EXPIRY_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Default Language" htmlFor="defaultLanguage">
            <select
              id="defaultLanguage"
              value={form.defaultLanguage}
              onChange={e => update('defaultLanguage', e.target.value as PortalLanguage)}
              className={INPUT_CLASS}
              required
            >
              {LANGUAGE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>

          <Field label="Timezone" htmlFor="timezone">
            <select
              id="timezone"
              value={form.timezone}
              onChange={e => update('timezone', e.target.value)}
              className={INPUT_CLASS}
              required
            >
              {TIMEZONE_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </Field>
        </div>

        <div className="flex items-center gap-3 pt-2 border-t border-surface-border">
          <button
            type="submit"
            disabled={isBusy}
            className="inline-flex items-center gap-2 px-5 py-2.5 mt-4 bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 disabled:opacity-50 transition-colors"
          >
            {isPending('save_settings')
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <Save className="w-4 h-4" />}
            {isPending('save_settings') ? 'Saving...' : 'Save Settings'}
          </button>
          <p className="text-xs text-slate-400 mt-4">
            Changes apply to the member app once backend wiring lands.
          </p>
        </div>
      </form>
    </Card>
  )
}
