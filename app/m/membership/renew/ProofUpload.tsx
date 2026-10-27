'use client'

import { useState } from 'react'
import { Loader2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { focusRing } from './UpiPayPanel'

const MAX_BYTES = 10 * 1024 * 1024
const ALLOWED = ['image/jpeg', 'image/png', 'application/pdf']

/**
 * Proof file + optional transaction ID + submit. `onSubmit` returns an error message to show, or null on
 * success (the parent then refreshes the page). `disabled` blocks submit (e.g. an invalid amount).
 */
export default function ProofUpload({
  onSubmit,
  disabled = false,
}: {
  onSubmit: (file: File, transactionId: string) => Promise<string | null>
  disabled?: boolean
}) {
  const [file, setFile] = useState<File | null>(null)
  const [txn, setTxn] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const onFile = (f: File | null) => {
    setError(null)
    if (!f) { setFile(null); return }
    if (!ALLOWED.includes(f.type)) { setFile(null); setError('Please choose a JPG, PNG or PDF file.'); return }
    if (f.size > MAX_BYTES) { setFile(null); setError('That file is larger than 10 MB. Please choose a smaller one.'); return }
    setFile(f)
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting || disabled || !file) return
    setSubmitting(true)
    setError(null)
    try {
      setError(await onSubmit(file, txn.trim()))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-4">
      <div>
        <label htmlFor="proof-file" className="mb-1 block text-sm font-semibold text-slate-700">
          Payment screenshot or PDF
        </label>
        <input
          id="proof-file"
          type="file"
          accept="image/jpeg,image/png,application/pdf"
          onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          className={cn('block min-h-[44px] w-full rounded-xl border border-surface-border bg-surface-card p-2 text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-500 file:px-3 file:py-2 file:text-sm file:font-bold file:text-white', focusRing)}
        />
        <p className="mt-1 text-xs text-slate-400">JPG, PNG or PDF, up to 10 MB.</p>
      </div>
      <div>
        <label htmlFor="proof-txn" className="mb-1 block text-sm font-semibold text-slate-700">
          UTR / transaction ID, optional
        </label>
        <input
          id="proof-txn"
          type="text"
          maxLength={100}
          value={txn}
          onChange={(e) => setTxn(e.target.value)}
          className={cn('block min-h-[44px] w-full rounded-xl border border-surface-border bg-surface-card px-3 text-sm text-slate-900', focusRing)}
        />
      </div>

      <p aria-live="polite" className={cn('text-sm font-medium text-red-600', !error && 'hidden')}>{error}</p>

      <button
        type="submit"
        disabled={!file || submitting || disabled}
        className={cn('flex min-h-[48px] w-full items-center justify-center gap-2 rounded-xl bg-brand-500 px-4 text-sm font-bold text-white disabled:opacity-50', focusRing)}
      >
        {submitting ? <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" /> : <Upload aria-hidden="true" className="h-4 w-4" />}
        {submitting ? 'Submitting…' : 'Submit for confirmation'}
      </button>
    </form>
  )
}
