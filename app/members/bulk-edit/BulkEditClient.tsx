'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, AlertTriangle, Edit2, Search, Trash2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { AREAS } from '@/lib/areas'

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

interface Props {
  members: MemberRow[]
  gymId: string
}

const cls = 'px-2 py-1.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-400 bg-white'

export function EditMembersClient({ members, gymId }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('edit')
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState('')
  const [activeAreaId, setActiveAreaId] = useState<string | null>(null)
  const blurTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})
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
      for (const id of Array.from(selected)) {
        const { error: e1 } = await supabase.from('attendance').delete().eq('member_id', id)
        if (e1) throw e1
        const { error: e2 } = await supabase.from('memberships').delete().eq('member_id', id)
        if (e2) throw e2
        const { error: e3 } = await supabase.from('members').delete().eq('id', id)
        if (e3) throw e3
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
      for (const { original, edited } of changes) {
        const { error: err } = await supabase
          .from('members')
          .update({
            member_number: parseInt(edited.member_number) || original.member_number,
            name: edited.name.trim(),
            phone: edited.phone.trim(),
            gender: edited.gender || null,
            age: edited.age ? parseInt(edited.age) : null,
            area: edited.area.trim() || null,
            pending_amount: parseInt(edited.pending_amount) || 0,
          })
          .eq('id', original.id)
        if (err) throw new Error(`Failed to update ${original.name}: ${err.message}`)
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
          <button onClick={() => setStep('edit')} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Review All Changes</h1>
        </div>

        <div className="card px-5 py-4 flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-50 rounded-xl flex items-center justify-center">
            <Edit2 className="w-4 h-4 text-brand-600" />
          </div>
          <div>
            <p className="font-bold text-gray-900">{changes.length} member{changes.length !== 1 ? 's' : ''} will be updated</p>
            <p className="text-xs text-gray-400">{members.length - changes.length} members unchanged</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-3.5 border-b border-gray-100 bg-gray-50">
            <p className="text-xs font-bold text-gray-400 uppercase tracking-wide">Changes Summary</p>
          </div>
          <div className="divide-y divide-gray-50">
            {changes.map(({ original, edited }) => {
              const diffs: { label: string; from: string; to: string }[] = []
              if (parseInt(edited.member_number) !== original.member_number)
                diffs.push({ label: 'ID', from: `#${original.member_number}`, to: `#${edited.member_number}` })
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
                  <p className="text-sm font-bold text-gray-900 mb-2">#{original.member_number} — {original.name}</p>
                  <div className="space-y-1.5 pl-3 border-l-2 border-brand-200">
                    {diffs.map(d => (
                      <div key={d.label} className="flex items-center gap-2 text-xs">
                        <span className="w-14 font-bold text-gray-400 uppercase">{d.label}</span>
                        <span className="text-red-500 line-through">{d.from}</span>
                        <span className="text-gray-400">→</span>
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
          <span className="text-sm text-gray-700 font-medium">
            I have reviewed all {changes.length} changes and confirm they are correct
          </span>
        </label>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep('edit')}
            className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 font-semibold text-sm rounded-2xl hover:bg-gray-200 transition-all"
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
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/members" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Members
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Edit Members</h1>
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
                <p className="font-bold text-gray-900">Delete {selected.size} member{selected.size !== 1 ? 's' : ''}?</p>
                <p className="text-xs text-gray-500 mt-0.5">This will also delete all their payments and attendance.</p>
              </div>
            </div>
            <div className="bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <p className="text-sm font-bold text-red-700">⚠️ This action cannot be recovered.</p>
              <p className="text-xs text-red-600 mt-1">All data for the selected members will be permanently deleted from the database.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="py-2.5 bg-gray-100 text-gray-700 font-semibold text-sm rounded-xl hover:bg-gray-200 transition-all"
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

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="search" placeholder="Search members..."
          value={search} onChange={e => setSearch(e.target.value)}
          className="input-field pl-9"
        />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-4 py-3 w-10">
                  <input type="checkbox"
                    checked={filtered.length > 0 && selected.size === filtered.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                  />
                </th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide w-20">ID</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Gender</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide w-20">Age</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide min-w-[180px]">Area</th>
                <th className="text-left px-4 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Pending Due (₹)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(m => {
                const e = edits[m.id]
                const changed =
                  e.name !== m.name || e.phone !== m.phone ||
                  e.gender !== (m.gender ?? '') ||
                  e.age !== (m.age ? String(m.age) : '') ||
                  e.area !== (m.area ?? '') ||
                  parseInt(e.member_number) !== m.member_number ||
                  parseInt(e.pending_amount) !== (m.pending_amount ?? 0)
                const areaSuggestions = e.area.length > 0
                  ? AREAS.filter(a => a.toLowerCase().includes(e.area.toLowerCase()))
                  : []

                return (
                  <tr key={m.id} className={selected.has(m.id) ? 'bg-red-50' : changed ? 'bg-brand-50/40' : 'hover:bg-gray-50'}>
                    <td className="px-4 py-2">
                      <input type="checkbox"
                        checked={selected.has(m.id)}
                        onChange={() => toggleSelect(m.id)}
                        className="w-4 h-4 rounded accent-red-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <input type="number" min="1" value={e.member_number}
                        onChange={ev => updateField(m.id, 'member_number', ev.target.value)}
                        className={`w-20 ${cls}`} />
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
                      <input type="text" value={e.area}
                        onChange={ev => { updateField(m.id, 'area', ev.target.value); setActiveAreaId(m.id) }}
                        onFocus={() => { clearTimeout(blurTimers.current[m.id]); setActiveAreaId(m.id) }}
                        onBlur={() => { blurTimers.current[m.id] = setTimeout(() => setActiveAreaId(null), 150) }}
                        className={`w-full ${cls}`} placeholder="Area" autoComplete="off" />
                      {activeAreaId === m.id && areaSuggestions.length > 0 && (
                        <ul className="absolute z-30 left-4 right-4 bg-white border border-gray-200 rounded-xl shadow-xl max-h-40 overflow-y-auto mt-0.5">
                          {areaSuggestions.slice(0, 6).map(a => (
                            <li key={a} onMouseDown={() => { updateField(m.id, 'area', a); setActiveAreaId(null) }}
                              className="px-3 py-2 text-sm text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                            >{a}</li>
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
