'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, AlertTriangle, Edit2, Search, Trash2, MapPin } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { searchLocalities, matchAreaBatch } from '@/lib/geo/matchArea'
import { formatMemberId } from '@/types'

interface MemberRow {
  id: string
  member_number: number
  name: string
  phone: string
  gender: string | null
  age: number | null
  area: string | null
  pending_amount: number
}

interface EditedRow {
  id: string
  member_number: string
  name: string
  phone: string
  gender: string
  age: string
  area: string
  pending_amount: string
}

type Step = 'edit' | 'preview'

interface AreaMeta {
  confidence: number
  matched_by: string
}

interface Props {
  members: MemberRow[]
  gymId: string
}

const cls = 'px-2 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white'

export function EditMembersClient({ members, gymId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('edit')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null)
  const [areaSuggestions, setAreaSuggestions] = useState<Record<string, Array<{ id: string; name: string; district: string }>>>({})
  const [areaMeta, setAreaMeta] = useState<Record<string, AreaMeta>>({})
  const blurTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
  const searchTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  // Wheel isolation for all data-scroll-box elements
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const box = (e.target as HTMLElement).closest('[data-scroll-box]') as HTMLElement | null
      if (!box) return
      const { scrollTop, scrollHeight, clientHeight } = box
      const atTop    = scrollTop <= 0 && e.deltaY < 0
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0
      if (!atTop && !atBottom) e.preventDefault()
    }
    document.addEventListener('wheel', onWheel, { passive: false })
    return () => document.removeEventListener('wheel', onWheel)
  }, [])

  // Normalize all existing area values on mount
  useEffect(() => {
    const withArea = members.filter(m => m.area)
    if (withArea.length === 0) return
    const BATCH = 50
    async function run() {
      const inputs = withArea.map(m => ({ raw: m.area!, gymId }))
      const results: AreaMeta[] = []
      for (let i = 0; i < inputs.length; i += BATCH) {
        const batch = await matchAreaBatch(inputs.slice(i, i + BATCH))
        batch.forEach(r => results.push({ confidence: r.confidence_score, matched_by: r.matched_by }))
      }
      const meta: Record<string, AreaMeta> = {}
      withArea.forEach((m, i) => { meta[m.id] = results[i] })
      setAreaMeta(meta)
    }
    run()
  }, [])

  const handleAreaSearch = useCallback((memberId: string, query: string) => {
    clearTimeout(searchTimers.current[memberId])
    if (query.length < 2) { setAreaSuggestions(prev => ({ ...prev, [memberId]: [] })); return }
    searchTimers.current[memberId] = setTimeout(async () => {
      const results = await searchLocalities(query)
      setAreaSuggestions(prev => ({ ...prev, [memberId]: results }))
    }, 200)
  }, [])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }

  function toggleSelectAll() {
    if (selected.size === filtered.length) setSelected(new Set())
    else setSelected(new Set(filtered.map(m => m.id)))
  }

  async function handleBulkDelete() {
    setDeleting(true)
    setError('')
    try {
      const ids = Array.from(selected)
      if (ids.length > 0) {
        const { error: e3 } = await supabase.from('members').delete().in('id', ids)
        if (e3) throw e3
        // Bust the Redis members cache so the list page reflects the deletions
        // instead of re-serving stale cached rows after navigation.
        const { invalidateMembersCache } = await import('../actions')
        await invalidateMembersCache(gymId)
      }
      router.push('/members')
      router.refresh()
    } catch (err: any) {
      setError('Failed to delete: ' + (err.message || 'Unknown error'))
      setDeleting(false)
      setShowDeleteConfirm(false)
    }
  }

  const [edits, setEdits] = useState<Record<string, EditedRow>>(() => {
    const map: Record<string, EditedRow> = {}
    members.forEach(m => {
      map[m.id] = {
        id: m.id,
        member_number: String(m.member_number),
        name: m.name,
        phone: m.phone,
        gender: m.gender ?? '',
        age: m.age ? String(m.age) : '',
        area: m.area ?? '',
        pending_amount: String(m.pending_amount ?? 0),
      }
    })
    return map
  })

  function updateField(id: string, field: keyof EditedRow, value: string) {
    setEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  const changes = members.filter(m => {
    const e = edits[m.id]
    return (
      e.name !== m.name ||
      e.phone !== m.phone ||
      e.gender !== (m.gender ?? '') ||
      e.age !== (m.age ? String(m.age) : '') ||
      e.area !== (m.area ?? '') ||
      parseInt(e.member_number) !== m.member_number ||
      parseInt(e.pending_amount) !== (m.pending_amount ?? 0)
    )
  }).map(m => ({ original: m, edited: edits[m.id] }))

  const filtered = members.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.phone.includes(search) ||
    String(m.member_number).includes(search)
  )

  function handlePreview() {
    if (changes.length === 0) { setError('No changes made.'); return }
    setError('')
    setConfirmed(false)
    setStep('preview')
  }

  async function handleSave() {
    if (!confirmed) return
    setLoading(true)
    setError('')
    try {
      // Track members whose pending dues transition from >0 to 0 in this save,
      // so we can stop their active payment_due_reminder cycle (same behaviour as
      // DuesClient). Collected during the loop and fired only after every update
      // succeeds, so we never cancel a cycle for a row that failed to save.
      const duesCleared: { memberId: string; phone: string }[] = []

      for (const { original, edited } of changes) {
        const newPending = parseInt(edited.pending_amount) || 0
        const { error: err } = await supabase
          .from('members')
          .update({
            member_number: parseInt(edited.member_number) || original.member_number,
            name: edited.name.trim(),
            phone: edited.phone.trim(),
            gender: edited.gender || null,
            age: edited.age ? parseInt(edited.age) : null,
            area: edited.area.trim() || null,
            pending_amount: newPending,
          })
          .eq('id', original.id)
        if (err) throw new Error(`Failed to update ${original.name}: ${err.message}`)

        const phone = edited.phone.trim()
        if ((original.pending_amount ?? 0) > 0 && newPending === 0 && phone.replace(/\D/g, '').length >= 10) {
          duesCleared.push({ memberId: original.id, phone })
        }
      }
      const { invalidateMembersCache } = await import('../actions')
      const cacheResult = await invalidateMembersCache(gymId)
      if (!cacheResult.success) {
        console.warn('Cache invalidation failed after member update:', cacheResult.error)
      }

      // Stop the due-reminder cycle for members who were just cleared to zero.
      // Fire-and-forget — never blocks the redirect or fails the save.
      if (duesCleared.length > 0) {
        const dueDate = new Date().toISOString().slice(0, 10)
        for (const { memberId, phone } of duesCleared) {
          fetch('/api/whatsapp/automation/due-cleared', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ gymId, memberId, phone, dueDate }),
          }).catch(() => {})
        }
      }

      router.push('/members')
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to save changes')
      setLoading(false)
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="max-w-3xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('edit')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Review All Changes</h1>
        </div>

        <div className="card px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
            <Edit2 className="w-4 h-4 text-brand-600" />
          </div>
          <div>
            <p className="font-bold text-slate-900">{changes.length} member{changes.length !== 1 ? 's' : ''} will be updated</p>
            <p className="text-xs text-slate-400">{members.length - changes.length} members unchanged</p>
          </div>
        </div>

        <div className="card">
          <div className="px-5 py-3.5 border-b border-slate-100 bg-slate-50 rounded-t-2xl">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Changes Summary</p>
          </div>
          <div className="divide-y divide-slate-50 overflow-y-auto rounded-b-2xl" style={{ maxHeight: '60vh', WebkitOverflowScrolling: 'touch' }}>
            {changes.map(({ original, edited }) => {
              const diffs: { label: string; from: string; to: string }[] = []
              if (parseInt(edited.member_number) !== original.member_number)
                diffs.push({ label: 'ID', from: formatMemberId(original.member_number), to: formatMemberId(parseInt(edited.member_number)) })
              if (edited.name !== original.name)
                diffs.push({ label: 'Name', from: original.name, to: edited.name })
              if (edited.phone !== original.phone)
                diffs.push({ label: 'Phone', from: original.phone, to: edited.phone })
              if (edited.gender !== (original.gender ?? ''))
                diffs.push({ label: 'Gender', from: original.gender ?? '—', to: edited.gender || '—' })
              if (edited.age !== (original.age ? String(original.age) : ''))
                diffs.push({ label: 'Age', from: original.age ? `${original.age} yrs` : '—', to: edited.age ? `${edited.age} yrs` : '—' })
              if (edited.area !== (original.area ?? ''))
                diffs.push({ label: 'Area', from: original.area ?? '—', to: edited.area || '—' })
              if (parseInt(edited.pending_amount) !== (original.pending_amount ?? 0))
                diffs.push({ label: 'Due', from: `₹${original.pending_amount ?? 0}`, to: `₹${edited.pending_amount}` })
              return (
                <div key={original.id} className="px-5 py-4">
                  <p className="text-sm font-bold text-slate-900 mb-2">{formatMemberId(original.member_number)} — {original.name}</p>
                  <div className="space-y-1.5 pl-3 border-l-2 border-brand-200">
                    {diffs.map(d => (
                      <div key={d.label} className="flex items-center gap-2 text-xs">
                        <span className="w-14 font-bold text-slate-400 uppercase">{d.label}</span>
                        <span className="text-red-500 line-through">{d.from}</span>
                        <span className="text-slate-400">→</span>
                        <span className="text-emerald-600 font-semibold">{d.to}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Please review carefully before saving</p>
            <p className="text-xs text-amber-700 mt-1">Once saved, all {changes.length} changes will be updated on the server.</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600" />
          <span className="text-sm text-slate-700 font-medium">
            I have reviewed all {changes.length} changes and confirm they are correct
          </span>
        </label>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep('edit')}
            className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 font-semibold text-sm rounded-2xl hover:bg-slate-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <button onClick={handleSave} disabled={!confirmed || loading}
            className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-sm rounded-2xl shadow-md shadow-brand-200 hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            {loading ? 'Saving...' : `Save ${changes.length} Changes`}
          </button>
        </div>
      </div>
    )
  }

  // ── Edit Table ────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 max-w-7xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Members
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Edit Members</h1>
        </div>
        <div className="flex items-center gap-2">
          {changes.length > 0 && (
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
              {changes.length} change{changes.length !== 1 ? 's' : ''}
            </span>
          )}
          <button onClick={handlePreview} disabled={changes.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-40"
          >
            <Check className="w-4 h-4" />Review & Save
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

      {/* Bulk delete bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <p className="text-sm font-semibold text-red-700">{selected.size} member{selected.size !== 1 ? 's' : ''} selected</p>
          <button
            onClick={() => setShowDeleteConfirm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white text-sm font-semibold rounded-lg hover:bg-red-600 transition-colors"
          >
            <Trash2 className="w-4 h-4" />Remove Members
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-red-100 rounded-xl flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="w-5 h-5 text-red-600" />
              </div>
              <div>
                <p className="font-bold text-slate-900">Delete {selected.size} member{selected.size !== 1 ? 's' : ''}?</p>
                <p className="text-xs text-slate-500 mt-0.5">This will also delete all their payments and attendance.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700">⚠️ This action cannot be recovered.</p>
              <p className="text-xs text-red-600 mt-1">All data for the selected members will be permanently deleted from the database.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="py-2.5 bg-slate-100 text-slate-700 font-semibold text-sm rounded-xl hover:bg-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={deleting}
                className="py-2.5 bg-red-500 text-white font-semibold text-sm rounded-xl hover:bg-red-600 transition-all disabled:opacity-60"
              >
                {deleting ? 'Deleting...' : 'Yes, Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="search" placeholder="Search members..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      {/* Areas needing review banner */}
      {(() => {
        const needsReview = members.filter(m => m.area && areaMeta[m.id] && areaMeta[m.id].confidence < 0.90)
        if (needsReview.length === 0) return null
        return (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              {needsReview.length} area{needsReview.length !== 1 ? 's' : ''} need review
            </p>
            <div className="flex items-center gap-2 ml-auto text-xs text-amber-700">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Suggested</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Unresolved</span>
            </div>
          </div>
        )
      })()}

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide w-20">ID</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Gender</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide w-20">Age</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide min-w-[180px]">Area ✦</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Pending Due (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(m => {
                const e = edits[m.id]
                const changed =
                  e.name !== m.name || e.phone !== m.phone ||
                  e.gender !== (m.gender ?? '') ||
                  e.age !== (m.age ? String(m.age) : '') ||
                  e.area !== (m.area ?? '') ||
                  parseInt(e.member_number) !== m.member_number ||
                  parseInt(e.pending_amount) !== (m.pending_amount ?? 0)

                return (
                  <tr key={m.id} className={selected.has(m.id) ? 'bg-red-50' : changed ? 'bg-brand-50/40' : 'hover:bg-slate-50'}>
                    <td className="px-4 py-2">
                      <input type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" value={e.member_number ? `GF${e.member_number.padStart(4, '0')}` : ''}
                        onChange={ev => {
                          const raw = ev.target.value.trim().toUpperCase()
                          const digits = raw.startsWith('GF') ? raw.slice(2) : raw
                          const num = parseInt(digits, 10)
                          updateField(m.id, 'member_number', isNaN(num) ? '' : String(num))
                        }}
                        placeholder="GF0001"
                        className={`w-24 ${cls}`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="text" value={e.name}
                        onChange={ev => updateField(m.id, 'name', ev.target.value)}
                        className={`w-full ${cls}`} />
                    </td>
                    <td className="px-4 py-2">
                      <input type="tel" value={e.phone} maxLength={10}
                        onChange={ev => updateField(m.id, 'phone', ev.target.value)}
                        className={`w-32 ${cls}`} />
                    </td>
                    <td className="px-4 py-2">
                      <select value={e.gender} onChange={ev => updateField(m.id, 'gender', ev.target.value)} className={cls}>
                        <option value="">—</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min="1" max="120" value={e.age}
                        onChange={ev => updateField(m.id, 'age', ev.target.value)}
                        className={`w-16 ${cls}`} placeholder="—" />
                    </td>
                    <td className="px-4 py-2 relative">
                      <div className="flex items-center gap-1.5">
                        {e.area && areaMeta[m.id] && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            areaMeta[m.id].confidence >= 0.90 ? 'bg-emerald-500' :
                            areaMeta[m.id].confidence >= 0.70 ? 'bg-amber-400' : 'bg-red-400'
                          }`} title={`${(areaMeta[m.id].confidence * 100).toFixed(0)}% confidence (${areaMeta[m.id].matched_by})`} />
                        )}
                        <input type="text" value={e.area}
                          onChange={ev => {
                            updateField(m.id, 'area', ev.target.value)
                            setActiveAreaId(m.id)
                            handleAreaSearch(m.id, ev.target.value)
                            // clear meta so dot disappears while editing
                            setAreaMeta(prev => { const n = { ...prev }; delete n[m.id]; return n })
                          }}
                          onFocus={() => { clearTimeout(blurTimers.current[m.id]); setActiveAreaId(m.id) }}
                          onBlur={() => { blurTimers.current[m.id] = setTimeout(() => setActiveAreaId(null), 150) }}
                          className={`w-full ${cls}`} placeholder="Area" autoComplete="off" />
                      </div>
                      {activeAreaId === m.id && (areaSuggestions[m.id] ?? []).length > 0 && (
                        <ul className="absolute z-30 left-4 right-4 bg-white border border-slate-200 rounded-xl shadow-xl max-h-40 overflow-y-auto mt-0.5" data-scroll-box>
                          {(areaSuggestions[m.id] ?? []).slice(0, 6).map(a => (
                            <li key={a.id} onMouseDown={() => {
                              updateField(m.id, 'area', a.name)
                              setAreaMeta(prev => ({ ...prev, [m.id]: { confidence: 1.0, matched_by: 'manual' } }))
                              setActiveAreaId(null)
                            }}
                              className="px-3 py-2 text-sm text-slate-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                            >
                              {a.name}
                              {a.district && <span className="text-xs text-slate-400 ml-1">{a.district}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min="0" value={e.pending_amount}
                        onChange={ev => updateField(m.id, 'pending_amount', ev.target.value)}
                        className={`w-28 ${cls}`} placeholder="0" />
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
