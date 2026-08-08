'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import ProgramSetupForm, { ProgramSetupData } from '@/components/programs/ProgramSetupForm'
import ExerciseBuilder from '@/components/programs/ExerciseBuilder'

export default function CreateProgramPage() {
  const [step, setStep] = useState(1)
  const [programData, setProgramData] = useState<ProgramSetupData>({
    name: '',
    summary: '',
    notes: '',
    duration: '4',
    frequency: '3',
    difficulty: 'Intermediate',
    goal: 'Build Muscle',
    category: 'Hypertrophy',
    equipment: 'Full Gym',
    targetAudience: 'Everyone',
    experienceLevel: 'Recreational',
  })

  const updateProgramData = (updates: Partial<ProgramSetupData>) => {
    setProgramData(prev => ({ ...prev, ...updates }))
  }

  return (
    <div className="w-full flex flex-col">
      <div className="mb-6 flex-shrink-0">
        <Link
          href="/programs"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-500 hover:text-brand-600 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Programs
        </Link>
        <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-slate-900">
          {step === 1 ? 'Create Workout Plan' : 'Program Builder'}
        </h1>
        <p className="text-sm font-semibold text-slate-500 mt-1">
          {step === 1 ? 'Step 1: Set up program framework' : 'Step 2: Build the daily schedule'}
        </p>
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
            programData={programData}
            onBack={() => setStep(1)}
          />
        )}
      </div>
    </div>
  )
}
