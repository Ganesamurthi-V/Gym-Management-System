'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import ProgramSetupForm, { ProgramSetupData } from '@/components/programs/ProgramSetupForm'
import ExerciseBuilder from '@/components/programs/ExerciseBuilder'
import { Trash2 } from 'lucide-react'

interface Props {
  program: any;
}

export default function EditProgramClient({ program }: Props) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [isDeleting, setIsDeleting] = useState(false)
  const [programData, setProgramData] = useState<ProgramSetupData>({
    name: program.name,
    summary: program.summary || '',
    notes: program.notes || '',
    duration: program.duration.toString(),
    frequency: program.frequency?.toString() || '3',
    difficulty: program.difficulty,
    goal: program.goal,
    category: program.category,
    equipment: program.equipment,
    targetAudience: program.target_audience,
    experienceLevel: program.experience_level
  })

  const updateProgramData = (updates: Partial<ProgramSetupData>) => {
    setProgramData(prev => ({ ...prev, ...updates }))
  }

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to delete this program? This cannot be undone.')) return
    
    try {
      setIsDeleting(true)
      const res = await fetch(`/api/programs?id=${program.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to delete')
      
      router.push('/programs')
      router.refresh()
    } catch (err: any) {
      alert(err.message)
      setIsDeleting(false)
    }
  }

  return (
    <div className="w-full h-full flex flex-col max-h-[calc(100vh-4rem)]">
      {/* Header */}
      <div className="mb-6 flex-shrink-0 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {step === 1 ? 'Edit Workout Plan' : 'Program Builder'}
          </h1>
          <p className="text-sm font-semibold text-slate-500 mt-1">
            {step === 1 ? 'Step 1: Modify program framework' : 'Step 2: Update the daily schedule'}
          </p>
        </div>
        <button 
          onClick={handleDelete}
          disabled={isDeleting}
          className="flex items-center gap-2 px-4 py-2 bg-red-50 text-red-600 rounded-xl hover:bg-red-100 font-bold text-sm transition-colors disabled:opacity-50"
        >
          <Trash2 className="w-4 h-4" />
          {isDeleting ? 'Deleting...' : 'Delete Program'}
        </button>
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
            initialSchedule={program.schedule}
            onBack={() => setStep(1)} 
          />
        )}
      </div>
    </div>
  )
}
