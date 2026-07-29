'use client'

import { useState } from 'react'
import {
  AlertTriangle, Database, HardDrive, Loader2, MessageCircle, RefreshCw,
  Send, ShieldAlert, Tag, Trash2, Wrench, X, Clock, Bell,
} from 'lucide-react'
import type { MaintenanceStatus, ServiceHealth } from '@/types/member-app'
import {
  clearMemberAppCache, resendFailedInvitations, retryFailedNotifications, toggleMaintenanceMode,
} from '@/app/member-app/actions'
import { useAsyncAction } from '../hooks/useMemberAppActions'
import { Badge, Card, SectionHeader, StatusDot, Toggle } from './ui'
import type { BadgeTone } from './ui'

const HEALTH_LABELS: Record<ServiceHealth, string> = {
  operational: 'Operational',
  degraded: 'Degraded',
  down: 'Down',
}

const HEALTH_TONES: Record<ServiceHealth, BadgeTone> = {
  operational: 'green',
  degraded: 'amber',
  down: 'red',
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

function StatusRow({
  icon, label, children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 p-4 bg-white rounded-xl border border-surface-border">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-50 text-slate-500 flex items-center justify-center flex-shrink-0">
          {icon}
        </div>
        <p className="text-sm font-semibold text-slate-700 truncate">{label}</p>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">{children}</div>
    </div>
  )
}

export default function MaintenancePanel({
  maintenance,
}: {
  gymId: string
  maintenance: MaintenanceStatus
}) {
  const [status, setStatus] = useState(maintenance)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const { run, isPending, isBusy } = useAsyncAction()

  const upToDate = status.appVersion === status.latestVersion
  const storagePct = Math.min(
    100,
    Math.round((status.storageUsedMb / Math.max(1, status.storageTotalMb)) * 100),
  )

  async function applyMaintenance(next: boolean) {
    const result = await run('toggle_maintenance', () => toggleMaintenanceMode(next))
    if (result?.success) setStatus(prev => ({ ...prev, maintenanceMode: next }))
    setConfirmOpen(false)
  }

  /** Enabling takes members offline, so it is gated behind a confirmation. */
  function handleMaintenanceToggle(next: boolean) {
    if (next) setConfirmOpen(true)
    else void applyMaintenance(false)
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <Card>
        <SectionHeader
          title="System Status"
          description="Health of the services powering the member app."
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <StatusRow icon={<Tag className="w-4 h-4" />} label="App Version">
            <span className="text-sm font-bold text-slate-900">{status.appVersion}</span>
          </StatusRow>

          <StatusRow icon={<Tag className="w-4 h-4" />} label="Latest Version">
            <span className="text-sm font-bold text-slate-900">{status.latestVersion}</span>
            {upToDate
              ? <Badge tone="green">Up to date</Badge>
              : <Badge tone="amber">Update available</Badge>}
          </StatusRow>

          <StatusRow icon={<Wrench className="w-4 h-4" />} label="Maintenance Mode">
            <Badge tone={status.maintenanceMode ? 'amber' : 'slate'}>
              {status.maintenanceMode ? 'Enabled' : 'Disabled'}
            </Badge>
            <Toggle
              checked={status.maintenanceMode}
              onChange={handleMaintenanceToggle}
              label="Toggle maintenance mode"
              disabled={isBusy}
            />
          </StatusRow>

          <StatusRow icon={<Database className="w-4 h-4" />} label="Supabase Status">
            <StatusDot tone={HEALTH_TONES[status.supabaseStatus]} />
            <span className="text-sm font-semibold text-slate-700">
              {HEALTH_LABELS[status.supabaseStatus]}
            </span>
          </StatusRow>

          <StatusRow icon={<MessageCircle className="w-4 h-4" />} label="WhatsApp API Status">
            <StatusDot tone={HEALTH_TONES[status.whatsappApiStatus]} />
            <span className="text-sm font-semibold text-slate-700">
              {HEALTH_LABELS[status.whatsappApiStatus]}
            </span>
          </StatusRow>

          <StatusRow icon={<Bell className="w-4 h-4" />} label="Notification Queue">
            <span className="text-sm font-bold text-slate-900">{status.notificationQueue}</span>
            <span className="text-xs text-slate-400">pending</span>
          </StatusRow>

          <StatusRow icon={<HardDrive className="w-4 h-4" />} label="Storage Usage">
            <span className="text-sm font-bold text-slate-900">
              {status.storageUsedMb}MB / {status.storageTotalMb}MB
            </span>
            <Badge tone={storagePct > 85 ? 'red' : storagePct > 60 ? 'amber' : 'green'}>
              {storagePct}%
            </Badge>
          </StatusRow>

          <StatusRow icon={<Clock className="w-4 h-4" />} label="Last Backup">
            <span className="text-sm font-semibold text-slate-700">
              {formatDateTime(status.lastBackup)}
            </span>
          </StatusRow>
        </div>
      </Card>

      <Card>
        <SectionHeader title="Actions" description="Recovery and cache operations." />

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => setConfirmOpen(true)}
            disabled={isBusy || status.maintenanceMode}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 border border-amber-200 text-sm font-bold rounded-xl hover:bg-amber-100 disabled:opacity-50 transition-colors"
          >
            <Wrench className="w-4 h-4" />
            Enable Maintenance Mode
          </button>

          <ActionButton
            label="Clear Cache"
            icon={<Trash2 className="w-4 h-4" />}
            pending={isPending('clear_cache')}
            disabled={isBusy}
            onClick={() => run('clear_cache', () => clearMemberAppCache())}
          />

          <ActionButton
            label="Resend Failed Invitations"
            icon={<Send className="w-4 h-4" />}
            pending={isPending('resend_invitations')}
            disabled={isBusy}
            onClick={() => run('resend_invitations', () => resendFailedInvitations())}
          />

          <ActionButton
            label="Retry Failed Notifications"
            icon={<RefreshCw className="w-4 h-4" />}
            pending={isPending('retry_notifications')}
            disabled={isBusy}
            onClick={() => run('retry_notifications', () => retryFailedNotifications())}
          />
        </div>
      </Card>

      {confirmOpen && (
        <MaintenanceConfirmModal
          pending={isPending('toggle_maintenance')}
          onCancel={() => setConfirmOpen(false)}
          onConfirm={() => applyMaintenance(true)}
        />
      )}
    </div>
  )
}

function ActionButton({
  label, icon, pending, disabled, onClick,
}: {
  label: string
  icon: React.ReactNode
  pending: boolean
  disabled: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-4 py-2.5 bg-white text-slate-700 border border-surface-border text-sm font-bold rounded-xl hover:bg-slate-50 disabled:opacity-50 transition-colors"
    >
      {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      {label}
    </button>
  )
}

function MaintenanceConfirmModal({
  pending, onCancel, onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="maintenance-title"
        className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-surface-border overflow-hidden"
      >
        <div className="flex items-start justify-between gap-3 p-5 border-b border-surface-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-50 text-amber-600 rounded-xl flex items-center justify-center flex-shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="maintenance-title" className="text-lg font-bold text-slate-900">
                Enable maintenance mode?
              </h3>
              <p className="text-sm text-slate-500 mt-0.5">Members will lose app access.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full disabled:opacity-50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5">
          <div className="flex items-start gap-2 text-sm text-slate-600 leading-relaxed">
            <ShieldAlert className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
            <p>
              While maintenance mode is on, the member app shows a maintenance notice and
              members cannot sign in. Owner portal access is unaffected.
            </p>
          </div>
        </div>

        <div className="flex gap-3 p-5 pt-0">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-slate-50 border border-surface-border text-slate-600 font-bold text-sm hover:bg-slate-100 disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 py-2.5 rounded-xl bg-amber-600 text-white font-bold text-sm hover:bg-amber-700 disabled:opacity-50 inline-flex items-center justify-center gap-2 transition-colors"
          >
            {pending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wrench className="w-4 h-4" />}
            {pending ? 'Enabling...' : 'Enable'}
          </button>
        </div>
      </div>
    </div>
  )
}
