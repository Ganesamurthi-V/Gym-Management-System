'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Check, Edit2, AlertTriangle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Member } from '@/types'
import { formatMemberId, parseMemberId } from '@/types'
import GooglePlacesAutocomplete from '@/components/location/GooglePlacesAutocomplete'

type Step = 'form' | 'preview'

interface Props {
  member: Member
}

export function EditMemberClient({ member }: Props) {
  const router = useRouter()
  const supabase = createClient()

  const [step, setStep] = useState<Step>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [numError, setNumError] = useState('')
  const [checkingNum, setCheckingNum] = useState(false)

  const [form, setForm] = useState({
    name: member.name,
    phone: member.phone,
    gender: (member.gender ?? '') as 'male' | 'female' | 'other' | '',
    age: member.age ? String(member.age) : '',
    area: member.area ?? '',
    member_number: String(member.member_number),
  })
  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  useEffect(() => {
    const num = parseInt(form.member_number)
    if (!num || num === member.member_number) { setNumError(''); return }
    setCheckingNum(true)
    setNumError('')
    const timer = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: gym } = await supabase.from('gyms').select('id').eq('owner_id', user.id).single()
      if (!gym) return
      const { data } = await supabase.from('members').select('id').eq('gym_id', gym.id).eq('member_number', num).single()
      setNumError(data ? `${formatMemberId(num)} is already taken` : '')
      setCheckingNum(false)
    }, 500)
    return () => clearTimeout(timer)
  }, [form.member_number])

  const changes: { field: string; label: string; from: string; to: string }[] = []
  if (form.member_number !== String(member.member_number))
    changes.push({ field: 'member_number', label: 'Member ID', from: formatMemberId(member.member_number), to: formatMemberId(parseInt(form.member_number)) })
  if (form.name !== member.name)
    changes.push({ field: 'name', label: 'Name', from: member.name, to: form.name })
  if (form.phone !== member.phone)
    changes.push({ field: 'phone', label: 'Phone', from: member.phone, to: form.phone })
  if (form.gender !== (member.gender ?? ''))
    changes.push({ field: 'gender', label: 'Gender', from: member.gender ?? '—', to: form.gender || '—' })
  if (form.age !== (member.age ? String(member.age) : ''))
    changes.push({ field: 'age', label: 'Age', from: member.age ? `${member.age} yrs` : '—', to: form.age ? `${form.age} yrs` : '—' })
  if (form.area !== (member.area ?? ''))
    changes.push({ field: 'area', label: 'Area', from: member.area ?? '—', to: form.area || '—' })

  function handlePreview(e: React.FormEvent) {
    e.preventDefault()
    if (numError) return
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
      const { error: err } = await supabase
        .from('members')
        .update({
          member_number: parseInt(form.member_number),
          name: form.name.trim(),
          phone: form.phone.trim(),
          ...(form.gender ? { gender: form.gender } : { gender: null }),
          age: form.age ? parseInt(form.age) : null,
          area: form.area.trim() || null,
        })
        .eq('id', member.id)
      if (err) throw err
      router.push(`/members/${member.id}`)
      router.refresh()
    } catch (err: any) {
      setError(err.message || 'Failed to save')
      setLoading(false)
    }
  }

  // ── Preview ───────────────────────────────────────────────────────────────
  if (step === 'preview') {
    return (
      <div className="max-w-xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep('form')} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Edit
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Review Changes</h1>
        </div>

        <div className="card overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Edit2 className="w-4 h-4 text-brand-500" />
            <h2 className="font-bold text-slate-900">Changes for {formatMemberId(member.member_number)} — {member.name}</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {changes.map(c => (
              <div key={c.field} className="px-5 py-3.5 flex items-center gap-4">
                <div className="w-20 text-xs font-bold text-slate-400 uppercase tracking-wide flex-shrink-0">{c.label}</div>
                <div className="flex-1 flex items-center gap-3 min-w-0">
                  <span className="text-sm text-red-500 line-through truncate">{c.from}</span>
                  <span className="text-slate-400">→</span>
                  <span className="text-sm text-emerald-600 font-semibold truncate">{c.to}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Warning — This action cannot be undone</p>
            <p className="text-xs text-amber-700 mt-1">Once saved, these changes are permanent. Please verify all details carefully.</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600" />
          <span className="text-sm text-slate-700 font-medium">I have reviewed the changes and confirm they are correct</span>
        </label>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep('form')}
            className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 font-semibold text-sm rounded-2xl hover:bg-slate-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <button onClick={handleSave} disabled={!confirmed || loading}
            className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-brand-500 to-brand-600 text-white font-semibold text-sm rounded-2xl shadow-md shadow-brand-200 hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-40"
          >
            <Check className="w-4 h-4" />{loading ? 'Saving...' : 'Save to Server'}
          </button>
        </div>
      </div>
    )
  }

  // ── Form ──────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href={`/members/${member.id}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />Member Details
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Edit Member</h1>
      </div>

      <div className="card p-5">
        <form onSubmit={handlePreview} className="space-y-5">
          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm font-medium">{error}</div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Member ID</label>
            <input type="text" value={form.member_number ? `GF${form.member_number.padStart(4, '0')}` : ''}
              onChange={e => {
                const raw = e.target.value.trim().toUpperCase()
                const digits = raw.startsWith('GF') ? raw.slice(2) : raw
                const num = parseInt(digits, 10)
                update('member_number', isNaN(num) ? '' : String(num))
              }}
              placeholder="GF0001"
              className={`input-field w-36 ${numError ? 'border-red-400 focus:ring-red-400' : ''}`} />
            {checkingNum && <p className="text-xs text-slate-400 mt-1.5">Checking...</p>}
            {numError && <p className="text-xs text-red-500 mt-1.5 font-medium">{numError}</p>}
            {!numError && !checkingNum && form.member_number !== String(member.member_number) && (
              <p className="text-xs text-emerald-600 mt-1.5 font-medium">✓ Available</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Full Name *</label>
            <input type="text" value={form.name} onChange={e => update('name', e.target.value)} className="input-field" required />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Phone Number *</label>
            <input type="tel" value={form.phone} onChange={e => update('phone', e.target.value)}
              className="input-field" required pattern="[0-9]{10}" maxLength={10} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Gender</label>
              <div className="grid grid-cols-3 gap-2">
                {(['male', 'female', 'other'] as const).map(g => (
                  <button key={g} type="button" onClick={() => update('gender', form.gender === g ? '' : g)}
                    className={`py-3 px-2 rounded-2xl border-2 text-sm font-semibold transition-all text-center ${
                      form.gender === g ? 'border-brand-500 bg-brand-50 text-brand-700' : 'border-slate-200 bg-white text-slate-500'
                    }`}
                  >
                    {g === 'male' ? 'M' : g === 'female' ? 'F' : 'O'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Age</label>
              <input type="number" value={form.age} onChange={e => update('age', e.target.value)}
                className="input-field" placeholder="25" min="1" max="120" />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Area / Locality</label>
            <GooglePlacesAutocomplete
              value={form.area}
              onChange={(val) => update('area', val)}
              onClear={() => update('area', '')}
            />
          </div>

          <button type="submit" disabled={!!numError || checkingNum} className="btn-primary disabled:opacity-50">
            Review Changes →
          </button>
        </form>
      </div>
    </div>
  )
}
