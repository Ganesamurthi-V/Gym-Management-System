'use client'

import { useMemo, useState } from 'react'
import { formatMemberId } from '@/types'
import type { MemberOption } from './BiometricClient'

// Small search-as-you-type picker. The member list is passed from the server page.
export function MemberPicker({
  members, value, onChange,
}: { members: MemberOption[]; value: string | null; onChange: (id: string | null) => void }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const selected = members.find(m => m.id === value) ?? null

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return members.slice(0, 8)
    return members
      .filter(m => m.name.toLowerCase().includes(q) || formatMemberId(m.memberNumber).toLowerCase().includes(q) || String(m.memberNumber ?? '') === q)
      .slice(0, 8)
  }, [members, query])

  return (
    <div className="relative">
      <input
        className="input-field"
        placeholder="Search member"
        value={open ? query : selected ? `${selected.name} (${formatMemberId(selected.memberNumber)})` : query}
        onFocus={() => { setOpen(true); setQuery('') }}
        onChange={e => { setQuery(e.target.value); setOpen(true); if (value) onChange(null) }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        aria-label="Search member"
      />
      {open && (
        <ul className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto rounded-xl border border-surface-border bg-surface-card shadow-lg">
          {results.length === 0 && <li className="px-3.5 py-3 text-sm text-slate-500">No member found</li>}
          {results.map(m => (
            <li key={m.id}>
              <button
                type="button"
                className="w-full text-left px-3.5 py-3 text-sm text-slate-900 hover:bg-slate-50 min-h-[44px]"
                onMouseDown={e => e.preventDefault()}
                onClick={() => { onChange(m.id); setOpen(false); setQuery('') }}
              >
                {m.name} <span className="text-slate-500">{formatMemberId(m.memberNumber)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
