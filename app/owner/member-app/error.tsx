'use client'

import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

/**
 * Section-level error boundary. Renders a retry card instead of letting a data
 * failure crash the whole app shell.
 */
export default function MemberAppError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Message only — never log payloads or tokens.
    console.error('[MEMBER_APP] render failed:', error.message)
  }, [error])

  return (
    <div className="max-w-8xl mx-auto">
      <div className="bg-white rounded-2xl shadow-sm border border-surface-border p-6">
        <div className="flex flex-col items-center text-center py-8">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <h2 className="text-base font-bold text-slate-900">Could not load Member App data</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-md">
            Something went wrong while loading this dashboard. Your member data is unaffected.
          </p>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 mt-6 bg-brand-500 text-white text-sm font-bold rounded-xl hover:bg-brand-600 transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            Try again
          </button>
        </div>
      </div>
    </div>
  )
}
