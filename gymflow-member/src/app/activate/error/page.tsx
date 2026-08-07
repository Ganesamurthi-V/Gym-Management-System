'use client'

import { useEffect } from 'react'
import Image from 'next/image'
import { Loader2 } from 'lucide-react'

/**
 * /activate/error — legacy landing page, kept as a forwarder.
 *
 * This page used to own the hash-token handling, which meant a completely
 * SUCCESSFUL activation displayed a URL that said "error". That logic now lives
 * at /activate/verifying.
 *
 * Verification links already sitting in members' inboxes may still resolve here,
 * so this forwards while preserving the fragment (where Supabase puts both the
 * tokens and the error details) and the query string.
 */
export default function ActivateErrorPage() {
  useEffect(() => {
    const { hash, search } = window.location
    window.location.replace(`/activate/verifying${search}${hash}`)
  }, [])

  return (
    <main className="flex min-h-dvh items-center justify-center px-4">
      <div className="flex flex-col items-center gap-4">
        <Image src="/icons/icon.svg" alt="GymFlow" width={48} height={48} className="rounded-2xl shadow-md" />
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        <p className="text-sm font-medium text-slate-600">Checking verification…</p>
      </div>
    </main>
  )
}
