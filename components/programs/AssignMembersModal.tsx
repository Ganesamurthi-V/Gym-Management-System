'use client'

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Search, UserMinus, UserPlus, Users, X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { createClient } from '@/lib/supabase/client'

interface MemberRow {
  id: string
  name: string
  phone: string
  member_number: number
}

interface Props {
  programId: string
  programName: string
  onClose: () => void
}

type Mode = 'idle' | 'assign_specific' | 'assign_all' | 'deassign'

export default function AssignMembersModal({ programId, programName, onClose }: Props) {
  const [mode, setMode] = useState<Mode>('idle')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set())
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  // Load members + current assignments on open
  useEffect(() => {
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const supabase = createClient()

        const { data: memberData } = await supabase
          .from('members')
          .select('id, name, phone, member_number')
          .order('name', { ascending: true })
          .limit(500)

        const res = await fetch(`/api/programs/assignments?programId=${programId}`)
        const json = await res.json()

        if (cancelled) return

        setMembers(memberData ?? [])
        setAssignedIds(new Set(json?.memberIds ?? []))
      } catch {
        toast.error('Failed to load members')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void load()
    return () => { cancelled = true }
  }, [programId])

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const selectAllUnassigned = useCallback(() => {
    const unassigned = members.filter(m => !assignedIds.has(m.id))
    setSelectedIds(new Set(unassigned.map(m => m.id)))
  }, [members, assignedIds])

  const selectAllAssigned = useCallback(() => {
    const assigned = members.filter(m => assignedIds.has(m.id))
    setSelectedIds(new Set(assigned.map(m => m.id)))
  }, [members, assignedIds])

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set())
  }, [])

  async function handleAssign() {
    if (submitting) return
    setSubmitting(true)

    try {
      const payload = mode === 'assign_all'
        ? { programId, mode: 'all', memberIds: [] }
        : { programId, mode: 'specific', memberIds: [...selectedIds] }

      const res = await fetch('/api/programs/assignments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.error ?? 'Assignment failed')
      }

      toast.success(json.message)
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to assign members')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDeassign() {
    if (submitting || selectedIds.size === 0) return
    setSubmitting(true)

    try {
      const res = await fetch('/api/programs/assignments', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ programId, memberIds: [...selectedIds] }),
      })

      const json = await res.json()

      if (!res.ok || !json.success) {
        throw new Error(json?.error ?? 'Failed to remove assignments')
      }

      toast.success(json.message)
      onClose()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to remove members')
    } finally {
      setSubmitting(false)
    }
  }

  const filtered = members.filter(m => {
    if (!search.trim()) return true
    const q = search.toLowerCase()
    return (
      m.name.toLowerCase().includes(q) ||
      m.phone.includes(q) ||
      String(m.member_number).includes(q)
    )
  })

  const unassignedFiltered = filtered.filter(m => !assignedIds.has(m.id))
  const assignedFiltered = filtered.filter(m => assignedIds.has(m.id))

  const resetToIdle = () => { setMode('idle'); setSelectedIds(new Set()); setSearch('') }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[85dvh]">

        {/* Header */}
        <div className="flex items-start justify-between p-5 border-b border-slate-100 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
              mode === 'deassign' ? 'bg-red-50 text-red-600' : 'bg-brand-50 text-brand-600'
            }`}>
              {mode === 'deassign' ? <UserMinus className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                {mode === 'deassign' ? 'Remove Members' : 'Assign Members'}
              </h3>
              <p className="text-sm text-slate-500 mt-0.5 line-clamp-1">{programName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">

          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="w-6 h-6 animate-spin text-brand-500" />
              <p className="text-sm text-slate-500">Loading members...</p>
            </div>
          ) : mode === 'idle' ? (
            /* ─── Mode selection ─────────────────────────────────────────── */
            <div className="space-y-3">
              <p className="text-sm text-slate-600 mb-4">
                What would you like to do?
              </p>

              <button
                type="button"
                onClick={() => setMode('assign_all')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all text-left group"
              >
                <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
                  <Users className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Assign to All Members</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    All {members.length} members will get this program
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setMode('assign_specific')}
                className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-200 hover:border-brand-300 hover:bg-brand-50/50 transition-all text-left group"
              >
                <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-brand-100 transition-colors">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">Select Specific Members</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Pick individual members to assign
                  </p>
                </div>
              </button>

              {assignedIds.size > 0 && (
                <button
                  type="button"
                  onClick={() => setMode('deassign')}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border border-red-100 hover:border-red-300 hover:bg-red-50/50 transition-all text-left group"
                >
                  <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center flex-shrink-0 group-hover:bg-red-100 transition-colors">
                    <UserMinus className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-900">Remove Assigned Members</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Deassign members from this program ({assignedIds.size} currently assigned)
                    </p>
                  </div>
                </button>
              )}

              {assignedIds.size > 0 && (
                <div className="mt-4 rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                  <p className="text-xs font-semibold text-slate-500">
                    Currently assigned: <span className="text-brand-600">{assignedIds.size} member{assignedIds.size === 1 ? '' : 's'}</span>
                  </p>
                </div>
              )}
            </div>

          ) : mode === 'assign_all' ? (
            /* ─── Confirm assign all ─────────────────────────────────────── */
            <div className="text-center py-6">
              <div className="w-14 h-14 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Users className="w-7 h-7" />
              </div>
              <p className="text-base font-bold text-slate-900">Assign to all {members.length} members?</p>
              <p className="text-sm text-slate-500 mt-2 max-w-xs mx-auto">
                Every current member in your gym will be assigned to <span className="font-semibold">{programName}</span>.
                Members already assigned will not be duplicated.
              </p>
            </div>

          ) : mode === 'deassign' ? (
            /* ─── De-assign: select members to remove ─────────────────────── */
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search assigned members..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:border-red-400 focus:ring-2 focus:ring-red-500/20 transition-all"
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {selectedIds.size} selected for removal
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllAssigned}
                    className="text-xs font-semibold text-red-600 hover:text-red-700"
                  >
                    Select all
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 max-h-[40dvh] overflow-y-auto -mx-1 px-1">
                {assignedFiltered.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">
                    {search ? 'No matching assigned members' : 'No members assigned yet'}
                  </p>
                )}

                {assignedFiltered.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      selectedIds.has(m.id)
                        ? 'bg-red-50 border border-red-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedIds.has(m.id)
                        ? 'bg-red-500 border-red-500 text-white'
                        : 'border-slate-300'
                    }`}>
                      {selectedIds.has(m.id) && <X className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400">GF{String(m.member_number).padStart(4, '0')} · {m.phone}</p>
                    </div>
                  </label>
                ))}
              </div>
            </>

          ) : (
            /* ─── Assign specific members ─────────────────────────────────── */
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search by name, phone, or ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm placeholder:text-slate-400 focus:outline-none focus:border-brand-400 focus:ring-2 focus:ring-brand-500/20 transition-all"
                />
              </div>

              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  {selectedIds.size} selected
                  {assignedIds.size > 0 && ` · ${assignedIds.size} already assigned`}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={selectAllUnassigned}
                    className="text-xs font-semibold text-brand-600 hover:text-brand-700"
                  >
                    Select all
                  </button>
                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={deselectAll}
                      className="text-xs font-semibold text-slate-500 hover:text-slate-700"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-1 max-h-[40dvh] overflow-y-auto -mx-1 px-1">
                {unassignedFiltered.length === 0 && assignedFiltered.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-6">No members found</p>
                )}

                {unassignedFiltered.map(m => (
                  <label
                    key={m.id}
                    className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors ${
                      selectedIds.has(m.id)
                        ? 'bg-brand-50 border border-brand-200'
                        : 'hover:bg-slate-50 border border-transparent'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedIds.has(m.id)}
                      onChange={() => toggleSelect(m.id)}
                      className="sr-only"
                    />
                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-colors ${
                      selectedIds.has(m.id)
                        ? 'bg-brand-500 border-brand-500 text-white'
                        : 'border-slate-300'
                    }`}>
                      {selectedIds.has(m.id) && <Check className="w-3 h-3" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{m.name}</p>
                      <p className="text-xs text-slate-400">GF{String(m.member_number).padStart(4, '0')} · {m.phone}</p>
                    </div>
                  </label>
                ))}

                {assignedFiltered.length > 0 && (
                  <>
                    <div className="pt-3 pb-1 px-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Already Assigned</p>
                    </div>
                    {assignedFiltered.map(m => (
                      <div
                        key={m.id}
                        className="flex items-center gap-3 p-3 rounded-xl opacity-50"
                      >
                        <div className="w-5 h-5 rounded-md bg-emerald-100 border-2 border-emerald-300 flex items-center justify-center flex-shrink-0">
                          <Check className="w-3 h-3 text-emerald-600" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-slate-600 truncate">{m.name}</p>
                          <p className="text-xs text-slate-400">GF{String(m.member_number).padStart(4, '0')} · {m.phone}</p>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {mode !== 'idle' && (
          <div className="flex gap-3 p-5 border-t border-slate-100 flex-shrink-0">
            <button
              type="button"
              onClick={resetToIdle}
              disabled={submitting}
              className="flex-1 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
            >
              Back
            </button>

            {mode === 'deassign' ? (
              <button
                type="button"
                onClick={handleDeassign}
                disabled={submitting || selectedIds.size === 0}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Removing...</>
                ) : (
                  <><UserMinus className="w-4 h-4" /> Remove {selectedIds.size}</>
                )}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleAssign}
                disabled={submitting || (mode === 'assign_specific' && selectedIds.size === 0)}
                className="flex-1 py-2.5 rounded-xl bg-brand-500 text-white font-bold text-sm hover:bg-brand-600 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Assigning...</>
                ) : mode === 'assign_all' ? (
                  <><Users className="w-4 h-4" /> Assign All</>
                ) : (
                  <><UserPlus className="w-4 h-4" /> Assign {selectedIds.size}</>
                )}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
