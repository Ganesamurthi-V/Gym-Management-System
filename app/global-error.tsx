'use client'
 
import * as Sentry from '@sentry/nextjs'
import { useEffect } from 'react'
import { AlertCircle, RefreshCcw } from 'lucide-react'
 
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    Sentry.captureException(error)
    console.error(error)
  }, [error])
 
  return (
    <html lang="en">
      <body className="antialiased">
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-gray-100">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <AlertCircle className="w-8 h-8 text-red-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              Critical System Error
            </h2>
            
            <p className="text-gray-500 mb-8 text-sm leading-relaxed">
              We encountered a catastrophic failure attempting to load the application layout. Our engineering team has been notified immediately.
            </p>

            <button
              onClick={() => reset()}
              className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white py-3 px-4 rounded-xl font-medium hover:bg-indigo-700 transition-colors shadow-sm"
            >
              <RefreshCcw className="w-4 h-4" />
              Reload Application
            </button>

            {error.digest && (
              <p className="mt-8 text-xs text-gray-400 font-mono">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        </div>
      </body>
    </html>
  )
}
