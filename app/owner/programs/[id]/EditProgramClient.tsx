'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'react-hot-toast'
import { Trash2, ArrowLeft, AlertTriangle, Loader2, X, UserPlus } from 'lucide-react'
import AssignMembersModal from '@/components/programs/AssignMembersModal'
import ProgramSetupForm, { ProgramSetupData } from '@/components/programs/ProgramSetupForm'
import ExerciseBuilder, { ExerciseInstance } from '@/components/programs/ExerciseBuilder'
import type { ProgramDay, WorkoutProgram } from '@/types'

const DAYS: ProgramDay[] = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/**
 * The builder indexes schedule[day] directly, so every day key must exist.
 * Older rows (or hand-edited JSON) may omit days entirely.
 */
function normalizeSchedule(raw: unknown): Record<string, ExerciseInstance[]> {
  const source = (raw && typeof raw === 'object' && !Array.isArray(raw))
    ? raw as Record<string, unknown>
    : {}

  const schedule: Record<string, ExerciseInstance[]> = {}
  for (const day of DAYS) {
    const entries = source[day]
    schedule[day] = Array.isArray(entries) ? entries as ExerciseInstance[] : []
  }
  return schedule
}

export default function EditProgramClient({ program }: { program: WorkoutProgram }) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isDeleting, setIsDeleting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [assignOpen, setAssignOpen] = useState(false)

  const [programData, setProgramData] = useState<ProgramSetupData>({
    name: program.name,
    summary: program.summary ?? '',
    notes: program.notes ?? '',
    duration: String(program.duration),
    // Fall back to the form defaults so every <select> stays controlled even
    // when the stored column is NULL.
    frequency: String(program.frequency ?? 3),
    difficulty: program.difficulty ?? 'Intermediate',
    goal: program.goal ?? 'Build Muscle',
    category: program.category ?? 'Hypertrophy',
    equipment: program.equipment ?? 'Full Gym',
    targetAudience: program.target_audience ?? 'Everyone',
    experienceLevel: program.experience_level ?? 'Recreational',
  })

  const updateProgramData = (updates: Partial<ProgramSetupData>) => {
    setProgramData(prev => ({ ...prev, ...updates }))
  }

  async function handleDelete() {
    if (isDeleting) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/programs?id=${encodeURIComponent(program.id)}`, {
        method: 'DELETE',
      })
      const json = await res.json().catch(() => null)
      if (!res.ok || !json?.success) {
        throw new Error(json?.error?.message ?? 'Failed to delete program')
      }

      toast.success('Program deleted')
      setConfirmOpen(false)
      router.push('/programs')
      router.refresh()
    } catch (err: any) {
      toast.error(err?.message ?? 'Failed to delete program')
      setIsDeleting(false)
    }
  }

  return (
    <div className="w-full flex flex-col">
      <div className="mb-6 flex-shrink-0 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Link
            href="/programs"
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600 transition-colors mb-3"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Programs
          </Link>
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">
              {step === 1 ? 'Edit Workout Plan' : 'Program Builder'}
            </h1>
            <span
              className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-md ${
                program.is_draft ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
              }`}
            >
              {program.is_draft ? 'Draft' : 'Published'}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            {step === 1 ? 'Step 1: Modify program framework' : 'Step 2: Update the daily schedule'}
          </p>
        </div>

        <div className="flex gap-2 self-start sm:self-auto">
          <button
            onClick={() => setAssignOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-brand-50 text-brand-700 rounded-xl hover:bg-brand-100 font-bold text-sm transition-colors"
          >
            <UserPlus className="w-4 h-4" />
            Assign Members
          </button>

          <button
            onClick={() => setConfirmOpen(true)}
            disabled={isDeleting}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-bold text-sm transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            Delete Program
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0 flex flex-col w-full">
        {step === 1 ? (
          <ProgramSetupForm
            data={programData}
            updateData={updateProgramData}
            onNext={() => setStep(2)}
          />
        ) : (
          <ExerciseBuilder
            programId={program.id}
            programData={programData}
            initialSchedule={normalizeSchedule(program.schedule)}
            onBack={() => setStep(1)}
          />
        )}
      </div>

      {assignOpen && (
        <AssignMembersModal
          programId={program.id}
          programName={program.name}
          onClose={() => setAssignOpen(false)}
        />
      )}

      {confirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-start justify-between p-5 border-b border-slate-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-red-50 text-red-600 rounded-xl flex items-center justify-center flex-shrink-0">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Delete this program?</h3>
                  <p className="text-sm text-slate-500 mt-0.5">This action cannot be undone.</p>
                </div>
              </div>
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={isDeleting}
                aria-label="Close"
                className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5">
              <p className="text-sm text-slate-600 leading-relaxed">
                <span className="font-bold text-slate-900">{program.name}</span> and its full
                weekly schedule will be permanently removed.
              </p>
            </div>

            <div className="flex gap-3 p-5 pt-0">
              <button
                onClick={() => setConfirmOpen(false)}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-600 font-bold text-sm hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={isDeleting}
                className="flex-1 py-2.5 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors disabled:opacity-50 inline-flex items-center justify-center gap-2"
              >
                {isDeleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
