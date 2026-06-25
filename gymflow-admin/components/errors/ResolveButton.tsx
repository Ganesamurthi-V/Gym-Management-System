'use client'

import { useState } from 'react'
import { Check, Loader2, Trash2 } from 'lucide-react'
import { resolveErrorAction } from '@/app/errors/actions'

export default function ResolveButton({ issueId }: { issueId: string }) {
  const [loading, setLoading] = useState(false)

  const handleResolve = async () => {
    setLoading(true)
    const res = await resolveErrorAction(issueId)
    if (!res.success) {
      alert('Failed to resolve error: ' + res.error)
      setLoading(false)
    }
    // If successful, the server action calls revalidatePath, 
    // so Next.js will automatically refetch the page and remove the item.
  }

  return (
    <button
      onClick={handleResolve}
      disabled={loading}
      className="text-slate-400 hover:text-emerald-400 transition-colors flex items-center gap-1.5 px-2 py-1 rounded-md hover:bg-emerald-500/10 disabled:opacity-50"
      title="Resolve/Delete Error"
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
    </button>
  )
}
