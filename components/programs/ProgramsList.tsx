'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, Calendar, Target, Clock, Dumbbell } from 'lucide-react'
import type { WorkoutProgramSummary } from '@/types'
import { tourAttr } from '@/lib/tours/anchors'

interface Props {
  programs: WorkoutProgramSummary[]
}

export default function ProgramsList({ programs }: Props) {
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState<'all' | 'published' | 'draft'>('all')

  const filteredPrograms = programs.filter(p => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                          (p.summary && p.summary.toLowerCase().includes(search.toLowerCase()))
    
    if (filter === 'published') return matchesSearch && !p.is_draft
    if (filter === 'draft') return matchesSearch && p.is_draft
    return matchesSearch
  })

  return (
    <div className="flex flex-col h-full min-h-0 w-full max-w-7xl mx-auto pb-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Workout Programs</h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">Manage and assign workout templates</p>
        </div>
        <Link href="/owner/programs/new" {...tourAttr('programsCreateBtn')} className="btn-primary w-full sm:w-auto px-6 whitespace-nowrap">
          <Plus className="w-4 h-4" />
          Create Program
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4 mb-6">
        <div {...tourAttr('programsSearch')} className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search programs..." 
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 placeholder:font-medium placeholder:text-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 transition-all shadow-sm"
          />
        </div>
        <div {...tourAttr('programsFilter')} className="flex bg-slate-100/80 p-1 rounded-xl shrink-0">
          {(['all', 'published', 'draft'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                filter === f ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {filteredPrograms.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center p-8 bg-white border border-slate-200 border-dashed rounded-3xl">
          <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
            <Dumbbell className="w-6 h-6 text-slate-400" />
          </div>
          <h3 className="text-lg font-bold text-slate-900">No programs found</h3>
          <p className="text-sm text-slate-500 max-w-md text-center mt-2 mb-6 font-medium">
            {search || filter !== 'all' 
              ? "We couldn't find any programs matching your filters." 
              : "Create your first workout program template to easily assign structured routines to your members."}
          </p>
          {!(search || filter !== 'all') && (
            <Link href="/owner/programs/new" className="btn-primary w-auto px-6">
              Create First Program
            </Link>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredPrograms.map((program) => (
            <Link 
              href={`/owner/programs/${program.id}`} 
              key={program.id}
              className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm hover:border-brand-300 hover:shadow-md transition-all group relative flex flex-col"
            >
              <div className="flex justify-between items-start mb-4">
                <div className="flex gap-2">
                  <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${
                    program.is_draft 
                      ? 'bg-amber-50 text-amber-600' 
                      : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    {program.is_draft ? 'Draft' : 'Published'}
                  </span>
                  {program.category && (
                    <span className="text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md bg-slate-100 text-slate-600">
                      {program.category}
                    </span>
                  )}
                </div>
              </div>

              <h3 className="text-lg font-bold text-slate-900 group-hover:text-brand-600 transition-colors line-clamp-1 mb-1">
                {program.name}
              </h3>
              <p className="text-sm text-slate-500 font-medium line-clamp-2 mb-6 flex-1">
                {program.summary || 'No summary provided.'}
              </p>

              <div className="grid grid-cols-3 gap-2 pt-4 border-t border-slate-100">
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1">
                    <Calendar className="w-3.5 h-3.5" /> Weeks
                  </span>
                  <span className="text-sm font-bold text-slate-700">{program.duration}</span>
                </div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1">
                    <Clock className="w-3.5 h-3.5" /> Days/Wk
                  </span>
                  <span className="text-sm font-bold text-slate-700">{program.frequency || '-'}</span>
                </div>
                <div className="flex flex-col">
                  <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400 mb-1">
                    <Target className="w-3.5 h-3.5" /> Level
                  </span>
                  <span className="text-sm font-bold text-slate-700">{program.difficulty || '-'}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
