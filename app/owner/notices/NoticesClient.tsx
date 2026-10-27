'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Eye, EyeOff, Megaphone, Pencil, Trash2, X } from 'lucide-react'
import { api, GymFlowAPIError } from '@/lib/api/client'
import { cn, todayIST } from '@/lib/utils'
import { addDays } from '@/lib/gamification/periods'
import { formatDate } from '@/lib/member/member-utils'
import { NOTICE_TEMPLATES, findPlaceholders, fillPlaceholders, placeholderInput, type NoticeTemplate } from '@/lib/notices/templates'
import { NOTICE_KINDS, NOTICE_LIMITS, type GymNotice, type NoticeKind } from '@/types/notice'

const KIND_LABEL: Record<NoticeKind, string> = {
  info: 'Info', holiday: 'Holiday', batch: 'New batch', closure: 'Closure', offer: 'Offer',
}
const KIND_BADGE: Record<NoticeKind, string> = {
  info: 'bg-slate-100 text-slate-700',
  holiday: 'bg-amber-100 text-amber-700',
  batch: 'bg-emerald-100 text-emerald-700',
  closure: 'bg-red-100 text-red-700',
  offer: 'bg-brand-100 text-brand-700',
}

const inputCls =
  'w-full rounded-xl border border-surface-border bg-surface px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-200'

function messageFor(err: unknown): string {
  if (err instanceof GymFlowAPIError) {
    if (err.code === 'TOO_MANY') return 'You can have up to 20 active notices. Hide or delete an old one first.'
    return err.message
  }
  return 'Something went wrong. Please try again.'
}

export function NoticesClient({ notices: serverNotices }: { notices: GymNotice[] }) {
  const router = useRouter()

  // Resync when router.refresh() delivers new server data.
  const [notices, setNotices] = useState(serverNotices)
  const [prevServer, setPrevServer] = useState(serverNotices)
  if (serverNotices !== prevServer) {
    setPrevServer(serverNotices)
    setNotices(serverNotices)
  }

  const today = todayIST()
  const maxDate = addDays(today, 365)

  const [editingId, setEditingId] = useState<string | null>(null)
  const [kind, setKind] = useState<NoticeKind>('info')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [expiresOn, setExpiresOn] = useState('')
  const [busy, setBusy] = useState<string | null>(null) // 'form' or a notice id
  const [formError, setFormError] = useState('')
  const [success, setSuccess] = useState('')
  const [listError, setListError] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  // Chosen template (raw text) + typed values; title/body derive from them until the owner edits by hand.
  const [tpl, setTpl] = useState<NoticeTemplate | null>(null)
  const [values, setValues] = useState<Record<string, string>>({})
  const tplNames = tpl
    ? findPlaceholders(`${tpl.title}\n${tpl.body}`).map(p => p.slice(1, -1))
    : []

  function setValue(name: string, v: string) {
    if (!tpl) return
    const next = { ...values, [name]: v }
    setValues(next)
    setTitle(fillPlaceholders(tpl.title, next))
    setBody(fillPlaceholders(tpl.body, next))
  }

  const placeholders = findPlaceholders(`${title}\n${body}`)
  const titleLen = title.trim().length
  const bodyLen = body.trim().length
  const invalidDate = expiresOn !== '' && (expiresOn < today || expiresOn > maxDate)
  const canSubmit =
    busy === null && placeholders.length === 0 && !invalidDate &&
    titleLen >= NOTICE_LIMITS.titleMin && bodyLen >= NOTICE_LIMITS.bodyMin

  function resetForm() {
    setEditingId(null); setKind('info'); setTitle(''); setBody(''); setExpiresOn(''); setFormError('')
    setTpl(null); setValues({})
  }

  function applyTemplate(id: string) {
    const t = NOTICE_TEMPLATES.find(x => x.id === id)
    if (!t) return
    setEditingId(null); setKind(t.kind); setTitle(t.title); setBody(t.body); setExpiresOn('')
    setTpl(t); setValues({})
    setFormError(''); setSuccess('')
  }

  function startEdit(n: GymNotice) {
    setEditingId(n.id); setKind(n.kind); setTitle(n.title); setBody(n.body)
    setTpl(null); setValues({})
    setExpiresOn(n.expiresOn && n.expiresOn >= today ? n.expiresOn : '')
    setFormError(''); setSuccess('')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (placeholders.length > 0) {
      setFormError(`Fill in ${placeholders.join(', ')} before posting.`)
      return
    }
    if (!canSubmit) return
    setBusy('form'); setFormError(''); setSuccess('')
    try {
      const payload = {
        kind, title: title.trim(), body: body.trim(),
        expires_on: expiresOn === '' ? null : expiresOn,
      }
      if (editingId) await api.patch(`/api/notices/${editingId}`, payload)
      else await api.post('/api/notices', payload)
      setSuccess(editingId ? 'Notice updated' : 'Notice posted')
      resetForm()
      router.refresh()
    } catch (err) {
      setFormError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }

  async function toggle(n: GymNotice) {
    setBusy(n.id); setListError('')
    try {
      await api.patch(`/api/notices/${n.id}`, { is_active: !n.isActive })
      router.refresh()
    } catch (err) {
      setListError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }

  async function remove(id: string) {
    setBusy(id); setListError('')
    try {
      await api.delete(`/api/notices/${id}`)
      setConfirmDeleteId(null)
      if (editingId === id) resetForm()
      router.refresh()
    } catch (err) {
      setListError(messageFor(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 md:gap-5 animate-slide-up">
      <div>
        <Link href="/owner/dashboard" className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold text-brand-600">
          <ArrowLeft className="h-4 w-4" /> Dashboard
        </Link>
        <h1 className="text-lg font-bold tracking-tight text-slate-900 sm:text-xl md:text-2xl">Gym notices</h1>
        <p className="mt-0.5 text-sm text-slate-500">Messages your members see on their app home screen.</p>
      </div>

      {/* Composer */}
      <form onSubmit={submit} className="card flex flex-col gap-4 p-4 md:p-5">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-widest text-slate-400">Start from a template</p>
          <div className="flex flex-wrap gap-2">
            {NOTICE_TEMPLATES.map(t => (
              <button
                key={t.id} type="button" onClick={() => applyTemplate(t.id)} disabled={busy !== null}
                className="min-h-[44px] rounded-full border border-surface-border bg-surface-secondary px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-2 text-sm font-semibold text-slate-700">Kind</p>
          <div role="radiogroup" aria-label="Kind" className="flex flex-wrap gap-2">
            {NOTICE_KINDS.map(k => (
              <button
                key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
                className={cn(
                  'min-h-[44px] rounded-xl border px-4 text-sm font-semibold',
                  kind === k
                    ? 'border-brand-500 bg-brand-500 text-white'
                    : 'border-surface-border bg-surface text-slate-700 hover:bg-slate-100',
                )}
              >
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
        </div>

        {tpl && tplNames.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-semibold text-slate-700">Fill in the details</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {tplNames.map(name => {
                // "from x" and its "to x" partner share one row; the partner is rendered by the "from" field.
                if (/^(new )?to /.test(name) && tplNames.includes(name.replace(/^(new )?to /, '$1from '))) return null
                const partner = /^(new )?from /.test(name) ? name.replace(/^(new )?from /, '$1to ') : ''
                const pair = partner && tplNames.includes(partner) ? [name, partner] : [name]
                const fields = pair.map(n => (
                  <div key={n}>
                    <label htmlFor={`ph-${n}`} className="mb-1 block text-xs font-semibold text-slate-500">
                      {n.charAt(0).toUpperCase() + n.slice(1)}
                    </label>
                    <input
                      id={`ph-${n}`} type={placeholderInput(n)} value={values[n] ?? ''} onChange={e => setValue(n, e.target.value)}
                      className={cn(inputCls, 'min-h-[44px]')} placeholder={n}
                    />
                  </div>
                ))
                return pair.length === 2
                  ? <div key={name} className="grid grid-cols-1 gap-3 sm:col-span-2 sm:grid-cols-2">{fields}</div>
                  : fields[0]
              })}
            </div>
          </div>
        )}

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="notice-title" className="text-sm font-semibold text-slate-700">Title</label>
            <span className={cn('text-xs', title.length > NOTICE_LIMITS.titleMax ? 'text-red-600' : 'text-slate-400')}>
              {title.length}/{NOTICE_LIMITS.titleMax}
            </span>
          </div>
          <input
            id="notice-title" value={title} onChange={e => { setTpl(null); setTitle(e.target.value) }}
            maxLength={NOTICE_LIMITS.titleMax} className={inputCls} placeholder="Short headline"
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="notice-body" className="text-sm font-semibold text-slate-700">Message</label>
            <span className={cn('text-xs', body.length > NOTICE_LIMITS.bodyMax ? 'text-red-600' : 'text-slate-400')}>
              {body.length}/{NOTICE_LIMITS.bodyMax}
            </span>
          </div>
          <textarea
            id="notice-body" value={body} onChange={e => { setTpl(null); setBody(e.target.value) }} rows={5}
            maxLength={NOTICE_LIMITS.bodyMax} className={cn(inputCls, 'resize-y')} placeholder="What do members need to know?"
          />
        </div>

        {placeholders.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3" role="status">
            <p className="text-sm font-semibold text-amber-700">Fill in {placeholders.join(', ')} before posting.</p>
          </div>
        )}

        <div>
          <label htmlFor="notice-until" className="mb-1.5 block text-sm font-semibold text-slate-700">
            Show until <span className="font-normal text-slate-400">(optional)</span>
          </label>
          <input
            id="notice-until" type="date" value={expiresOn} min={today} max={maxDate}
            onChange={e => setExpiresOn(e.target.value)} className={cn(inputCls, 'min-h-[44px] sm:max-w-[220px]')}
          />
          <p className="mt-1 text-xs text-slate-400">
            {invalidDate ? 'Pick a date from today up to one year ahead.' : 'Leave empty to show it until you hide or delete it.'}
          </p>
        </div>

        {formError && <p role="alert" className="text-sm font-semibold text-red-600">{formError}</p>}
        {success && <p role="status" className="text-sm font-semibold text-emerald-600">{success}</p>}

        <div className="flex flex-wrap gap-2">
          <button
            type="submit" disabled={!canSubmit}
            className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-bold text-white disabled:opacity-60"
          >
            <Megaphone className="h-4 w-4" />
            {busy === 'form' ? 'Saving...' : editingId ? 'Save changes' : 'Post notice'}
          </button>
          {editingId && (
            <button
              type="button" onClick={resetForm} disabled={busy !== null}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-surface-border px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
            >
              <X className="h-4 w-4" /> Cancel edit
            </button>
          )}
        </div>
      </form>

      {/* List */}
      {listError && <p role="alert" className="text-sm font-semibold text-red-600">{listError}</p>}
      {notices.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          No notices yet. Pick a template above to post your first one.
        </div>
      ) : (
        <ul className="flex flex-col gap-3">
          {notices.map(n => {
            const expired = n.expiresOn !== null && n.expiresOn < today
            const status = expired ? 'Expired' : n.isActive ? 'Live' : 'Hidden'
            const statusCls = expired
              ? 'bg-slate-100 text-slate-600'
              : n.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
            const rowBusy = busy === n.id
            return (
              <li key={n.id} className="card p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', KIND_BADGE[n.kind])}>{KIND_LABEL[n.kind]}</span>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-bold', statusCls)}>{status}</span>
                </div>
                <h2 className="mt-2 break-words text-base font-bold text-slate-900">{n.title}</h2>
                <p className="mt-1 whitespace-pre-line break-words text-sm text-slate-600">{n.body}</p>
                <p className="mt-2 text-xs text-slate-400">
                  Posted {formatDate(n.createdAt)} · {n.expiresOn ? `Shows until ${formatDate(n.expiresOn)}` : 'No end date'}
                </p>

                {confirmDeleteId === n.id ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Delete this notice?</span>
                    <button
                      onClick={() => remove(n.id)} disabled={busy !== null}
                      className="min-h-[44px] rounded-xl bg-red-500 px-4 text-sm font-bold text-white disabled:opacity-60"
                    >
                      {rowBusy ? 'Deleting...' : 'Yes, delete'}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)} disabled={busy !== null}
                      className="min-h-[44px] rounded-xl border border-surface-border px-4 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      Keep it
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={() => toggle(n)} disabled={busy !== null}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-surface-border px-3.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      {n.isActive ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      {rowBusy ? 'Saving...' : n.isActive ? 'Hide' : 'Show'}
                    </button>
                    <button
                      onClick={() => startEdit(n)} disabled={busy !== null}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-surface-border px-3.5 text-sm font-semibold text-slate-700 disabled:opacity-60"
                    >
                      <Pencil className="h-4 w-4" /> Edit
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(n.id)} disabled={busy !== null}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-3.5 text-sm font-semibold text-red-600 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" /> Delete
                    </button>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
