'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, Trash2, Copy, GripVertical, Settings2, PlayCircle, ChevronDown, Check, Video, X, Dumbbell } from 'lucide-react'

// --- Mock Data ---
const EXERCISE_LIBRARY = [
  // Chest
  { name: 'Barbell Bench Press', type: 'Strength', target: 'Chest', equipment: 'Barbell' },
  { name: 'Incline Dumbbell Bench Press', type: 'Strength', target: 'Chest', equipment: 'Dumbbells' },
  { name: 'Pec Deck', type: 'Strength', target: 'Chest', equipment: 'Machine' },
  { name: 'Cable Crossover', type: 'Strength', target: 'Chest', equipment: 'Cables' },
  { name: 'Incline Barbell Bench Press', type: 'Strength', target: 'Chest', equipment: 'Barbell' },
  { name: 'Dumbbell Bench Press', type: 'Strength', target: 'Chest', equipment: 'Dumbbells' },
  { name: 'Dumbbell Fly', type: 'Strength', target: 'Chest', equipment: 'Dumbbells' },
  { name: 'Incline Dumbbell Fly', type: 'Strength', target: 'Chest', equipment: 'Dumbbells' },
  { name: 'Chest Press Machine', type: 'Strength', target: 'Chest', equipment: 'Machine' },
  { name: 'Barbell Declined Bench Press', type: 'Strength', target: 'Chest', equipment: 'Barbell' },
  { name: 'Dumbbell Declined Bench Press', type: 'Strength', target: 'Chest', equipment: 'Dumbbells' },
  { name: 'Push Ups', type: 'Strength', target: 'Chest', equipment: 'Bodyweight' },

  // Triceps
  { name: 'Lying Triceps Extension', type: 'Strength', target: 'Triceps', equipment: 'Barbell' },
  { name: 'Triceps Pressdown', type: 'Strength', target: 'Triceps', equipment: 'Cables' },
  { name: 'Cable Rope Pushdown', type: 'Strength', target: 'Triceps', equipment: 'Cables' },
  { name: 'Dumbbell Overhead Triceps Extension', type: 'Strength', target: 'Triceps', equipment: 'Dumbbells' },
  { name: 'Close Grip Bench Press', type: 'Strength', target: 'Triceps', equipment: 'Barbell' },
  { name: 'Kickback', type: 'Strength', target: 'Triceps', equipment: 'Dumbbells' },
  { name: 'Reverse Grip Cable Triceps Extension with Barbell', type: 'Strength', target: 'Triceps', equipment: 'Cables' },
  { name: 'Single-Arm Cable Triceps Extension', type: 'Strength', target: 'Triceps', equipment: 'Cables' },
  { name: 'Single-Arm Cable Triceps Extension with Supinated Grip', type: 'Strength', target: 'Triceps', equipment: 'Cables' },
  { name: 'Lying Dumbbell Triceps Extension', type: 'Strength', target: 'Triceps', equipment: 'Dumbbells' },
  { name: 'Seated Barbell French Press', type: 'Strength', target: 'Triceps', equipment: 'Barbell' },
  { name: 'Bench Dips', type: 'Strength', target: 'Triceps', equipment: 'Bodyweight' },
  { name: 'Parallel Dip Bar', type: 'Strength', target: 'Triceps', equipment: 'Bodyweight' },

  // Calves
  { name: 'Seated Calf Raise', type: 'Strength', target: 'Calves', equipment: 'Machine' },
  { name: 'Standing Calf Raise', type: 'Strength', target: 'Calves', equipment: 'Machine' },

  // Back
  { name: 'Dumbbell Bent-Over Row (Single Arm)', type: 'Strength', target: 'Back', equipment: 'Dumbbells' },
  { name: 'Wide-Grip Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Seated Cable Row', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Close-Grip Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Barbell Row', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Behind-Neck Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Reverse-Grip Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Rope Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'T-Bar Rows', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Barbell Bent Over Rows Supinated Grip', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Pull Up', type: 'Strength', target: 'Back', equipment: 'Bodyweight' },
  { name: 'Behind the Neck Pull Up', type: 'Strength', target: 'Back', equipment: 'Bodyweight' },
  { name: 'Pull Up with a Supinated Grip', type: 'Strength', target: 'Back', equipment: 'Bodyweight' },
  { name: 'Straight Arm Lat Pulldown', type: 'Strength', target: 'Back', equipment: 'Cables' },
  { name: 'Dumbbell Bent Over Rows', type: 'Strength', target: 'Back', equipment: 'Dumbbells' },
  { name: 'Dumbbell Pullover', type: 'Strength', target: 'Back', equipment: 'Dumbbells' },
  { name: 'Barbell Pullover', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Barbell Deadlift', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Barbell Sumo Deadlift', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Trap Bar Deadlift', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Dumbbell Deadlift', type: 'Strength', target: 'Back', equipment: 'Dumbbells' },
  { name: 'Barbell Shrug', type: 'Strength', target: 'Back', equipment: 'Barbell' },
  { name: 'Dumbbell Shrugs', type: 'Strength', target: 'Back', equipment: 'Dumbbells' },

  // Biceps
  { name: 'Barbell Curl', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },
  { name: 'Alternating Dumbbell Curl', type: 'Strength', target: 'Biceps', equipment: 'Dumbbells' },
  { name: 'Rope Cable Curl', type: 'Strength', target: 'Biceps', equipment: 'Cables' },
  { name: 'EZ Barbell Curl', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },
  { name: 'EZ Barbell Preacher Curl', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },
  { name: 'Hammer Curl', type: 'Strength', target: 'Biceps', equipment: 'Dumbbells' },
  { name: 'Incline Dumbbell Curl', type: 'Strength', target: 'Biceps', equipment: 'Dumbbells' },
  { name: 'Dumbbell Concentration Curl', type: 'Strength', target: 'Biceps', equipment: 'Dumbbells' },
  { name: 'Single-Arm Low Pulley Cable Curl', type: 'Strength', target: 'Biceps', equipment: 'Cables' },
  { name: 'Straight Bar Low Pulley Cable Curl', type: 'Strength', target: 'Biceps', equipment: 'Cables' },
  { name: 'Standing High Pulley Cable Curl', type: 'Strength', target: 'Biceps', equipment: 'Cables' },
  { name: 'Seated Barbell Wrist Curl', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },
  { name: 'Seated Barbell Wrist Extension', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },
  { name: 'Reverse Barbell Curl', type: 'Strength', target: 'Biceps', equipment: 'Barbell' },

  // Abdominals
  { name: 'Crunch', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Oblique Crunch', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Crunch Machine', type: 'Strength', target: 'Abdominals', equipment: 'Machine' },
  { name: 'Rope Ab Pulldown', type: 'Strength', target: 'Abdominals', equipment: 'Cables' },
  { name: 'Plank', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Hanging Leg Raise', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Bent Knee Reverse Crunch', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Long Arm Crunch', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },
  { name: 'Plank Get Ups', type: 'Strength', target: 'Abdominals', equipment: 'Bodyweight' },

  // Shoulders
  { name: 'Dumbbell Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'Dumbbell Lateral Raise', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'Dumbbell Front Raise', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'High Cable Rear Delt Fly', type: 'Strength', target: 'Shoulders', equipment: 'Cables' },
  { name: 'Smith Machine Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Machine' },
  { name: 'Barbell Upright Row', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Bent-Over Lateral Raise', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'Cable One-Arm Lateral Raise', type: 'Strength', target: 'Shoulders', equipment: 'Cables' },
  { name: 'Dumbbell Push Press', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'Barbell Push Press', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Single-Arm Cable Front Raise', type: 'Strength', target: 'Shoulders', equipment: 'Cables' },
  { name: 'Barbell Front Raise', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Seated Barbell Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Seated Behind the Neck Barbell Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Standing Barbell Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Standing Behind the Neck Barbell Shoulder Press', type: 'Strength', target: 'Shoulders', equipment: 'Barbell' },
  { name: 'Alternate Dumbbell Front Raise Neutral Grip', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },
  { name: 'One-Arm Low-Pulley Front Raise Neutral Grip', type: 'Strength', target: 'Shoulders', equipment: 'Cables' },
  { name: 'Two-Handed Dumbbell Front Raise', type: 'Strength', target: 'Shoulders', equipment: 'Dumbbells' },

  // Legs
  { name: 'Squat', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Leg Press', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Leg Extension', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Lunge', type: 'Strength', target: 'Legs', equipment: 'Dumbbells' },
  { name: 'Lying Leg Curl', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Hack Squat', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Seated Leg Curl', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Single Leg Extension', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Front Squat', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Dumbbell Stiff-Leg Deadlift', type: 'Strength', target: 'Legs', equipment: 'Dumbbells' },
  { name: 'Barbell Stiff-Leg Deadlift', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Dumbbell Goblet Squat', type: 'Strength', target: 'Legs', equipment: 'Dumbbells' },
  { name: 'Knee Tuck Jumps', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Burpees', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Bodyweight Squat', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: '1.5 Rep Bodyweight Squats', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Medicine Ball Squat', type: 'Strength', target: 'Legs', equipment: 'Medicine Ball' },
  { name: 'Barbell Bulgarian Split Squat', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Bodyweight Bulgarian Split Squat', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Mini-Band Air Squat', type: 'Strength', target: 'Legs', equipment: 'Band' },
  { name: 'Jump Squat', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Wall Sit', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Medicine Ball Deadlift', type: 'Strength', target: 'Legs', equipment: 'Medicine Ball' },
  { name: 'Single Leg Bodyweight Deadlift', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Kettlebell Sumo Deadlift', type: 'Strength', target: 'Legs', equipment: 'Kettlebell' },
  { name: 'Good Morning', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Bodyweight Glute Bridge', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Single Leg Glute Bridge', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Banded Glute Bridge', type: 'Strength', target: 'Legs', equipment: 'Band' },
  { name: 'Duck Walk', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Bird Dog', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Groiners', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Fire Hydrants', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Smith Machine Hip Thrust', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Barbell Hip Thrust', type: 'Strength', target: 'Legs', equipment: 'Barbell' },
  { name: 'Band Seated Hip Abduction', type: 'Strength', target: 'Legs', equipment: 'Band' },
  { name: 'Seated Hip Abduction Machine', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Standing Cable Abduction', type: 'Strength', target: 'Legs', equipment: 'Cables' },
  { name: 'Bodyweight Frog Pump', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Smith Machine Frog Pump', type: 'Strength', target: 'Legs', equipment: 'Machine' },
  { name: 'Banded Clams', type: 'Strength', target: 'Legs', equipment: 'Band' },
  { name: 'Side Lying Leg Raise', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Glute Ham Raise', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Dumbbell Step Up', type: 'Strength', target: 'Legs', equipment: 'Dumbbells' },
  { name: 'Lateral Mini-Band Walk', type: 'Strength', target: 'Legs', equipment: 'Band' },
  { name: 'Standing Knee Raise', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Kettlebell Swings', type: 'Strength', target: 'Legs', equipment: 'Kettlebell' },
  { name: 'Standing Cable Kickback', type: 'Strength', target: 'Legs', equipment: 'Cables' },
  { name: 'Donkey Kicks', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Side Lying Hip Raise', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },
  { name: 'Squat Sit to Reach', type: 'Strength', target: 'Legs', equipment: 'Bodyweight' },

  // Cardio / Mobility Extras
  { name: 'Treadmill Sprint', type: 'Cardio', target: 'Full Body', equipment: 'Treadmill' },
  { name: '90/90 Stretch', type: 'Mobility', target: 'Hips', equipment: 'Bodyweight' }
]

export interface ExerciseInstance {
  id: string;
  name: string;
  type: string;
  target: string;
  notes: string;
  // Progressions per week. Key is week number (1, 2, 3...)
  progressions: Record<number, any[]>;
}

interface Props {
  programId?: string;
  programData: any;
  initialSchedule?: Record<string, ExerciseInstance[]>;
  onBack: () => void;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function ExerciseBuilder({ programId, programData, initialSchedule, onBack }: Props) {
  const router = useRouter()
  const [activeDay, setActiveDay] = useState('Mon')
  const [activeWeek, setActiveWeek] = useState(1)
  const [isPublishing, setIsPublishing] = useState(false)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  
  // State: day -> array of exercises
  const [exercises, setExercises] = useState<Record<string, ExerciseInstance[]>>(
    initialSchedule || {
      Mon: [], Tue: [], Wed: [], Thu: [], Fri: [], Sat: [], Sun: []
    }
  )

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)

  const durationWeeks = parseInt(programData.duration) || 4

  const handleSave = async (isDraft: boolean) => {
    try {
      if (isDraft) setIsSavingDraft(true)
      else setIsPublishing(true)

      const payload = {
        id: programId,
        ...programData,
        schedule: exercises,
        isDraft
      }

      const res = await fetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to save program')

      alert(`Program successfully ${isDraft ? 'saved as draft' : 'published'}!`)
      router.push('/programs')
      router.refresh()
    } catch (err: any) {
      alert(err.message)
    } finally {
      setIsSavingDraft(false)
      setIsPublishing(false)
    }
  }

  // --- Handlers ---
  const addExercise = (template: typeof EXERCISE_LIBRARY[0]) => {
    const newEx: ExerciseInstance = {
      id: Math.random().toString(36).substring(7),
      name: template.name,
      type: template.type,
      target: template.target,
      notes: '',
      progressions: {
        1: [createEmptySet(template.type)]
      }
    }
    
    setExercises(prev => ({
      ...prev,
      [activeDay]: [...prev[activeDay], newEx]
    }))
    setSearchQuery('')
    setShowSearch(false)
  }

  const createEmptySet = (type: string) => {
    if (type === 'Strength') return { exerciseName: '', reps: '8-10', weight: '', rpe: '@8', rest: '90s', tempo: '2010' }
    if (type === 'Cardio') return { duration: '15m', intensity: 'Zone 2', distance: '' }
    if (type === 'Mobility') return { holdTime: '60s', rounds: '2' }
    return {}
  }

  const duplicatePreviousWeek = (exId: string, currentWeek: number) => {
    setExercises(prev => {
      const dayExs = [...prev[activeDay]]
      const idx = dayExs.findIndex(e => e.id === exId)
      if (idx === -1) return prev

      const ex = { ...dayExs[idx] }
      // Get previous week's sets, or an empty set if not found
      const prevSets = ex.progressions[currentWeek - 1] || [createEmptySet(ex.type)]
      ex.progressions = {
        ...ex.progressions,
        [currentWeek]: JSON.parse(JSON.stringify(prevSets)) // deep copy
      }
      dayExs[idx] = ex
      return { ...prev, [activeDay]: dayExs }
    })
  }

  const deleteExercise = (exId: string) => {
    setExercises(prev => ({
      ...prev,
      [activeDay]: prev[activeDay].filter(e => e.id !== exId)
    }))
  }

  const addSet = (exId: string) => {
    setExercises(prev => {
      const dayExs = [...prev[activeDay]]
      const idx = dayExs.findIndex(e => e.id === exId)
      const ex = { ...dayExs[idx] }
      const currentSets = ex.progressions[activeWeek] || []
      
      ex.progressions = {
        ...ex.progressions,
        [activeWeek]: [...currentSets, createEmptySet(ex.type)]
      }
      dayExs[idx] = ex
      return { ...prev, [activeDay]: dayExs }
    })
  }

  const updateSet = (exId: string, setIdx: number, field: string, value: string) => {
    setExercises(prev => {
      const dayExs = [...prev[activeDay]]
      const exIdx = dayExs.findIndex(e => e.id === exId)
      const ex = { ...dayExs[exIdx] }
      const currentSets = [...(ex.progressions[activeWeek] || [])]
      
      currentSets[setIdx] = { ...currentSets[setIdx], [field]: value }
      ex.progressions = { ...ex.progressions, [activeWeek]: currentSets }
      
      dayExs[exIdx] = ex
      return { ...prev, [activeDay]: dayExs }
    })
  }

  // --- HTML5 Drag & Drop ---
  const dragItem = useRef<number | null>(null)
  const dragOverItem = useRef<number | null>(null)
  const [dragEnabledId, setDragEnabledId] = useState<string | null>(null)

  const handleSort = () => {
    if (dragItem.current === null || dragOverItem.current === null) return
    const _exercises = [...exercises[activeDay]]
    const draggedContent = _exercises.splice(dragItem.current, 1)[0]
    _exercises.splice(dragOverItem.current, 0, draggedContent)
    
    setExercises(prev => ({ ...prev, [activeDay]: _exercises }))
    dragItem.current = null
    dragOverItem.current = null
  }

  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto min-h-[500px]">
      
      {/* Left Main Builder */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
        
        {/* Top Header & Day Tabs */}
        <div className="border-b border-slate-100 bg-slate-50/50">
          <div className="px-6 py-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Settings2 className="w-5 h-5 text-brand-600" />
              Exercise Builder
            </h2>
            <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 p-1 shadow-sm">
              <button 
                onClick={() => setActiveWeek(Math.max(1, activeWeek - 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30"
                disabled={activeWeek === 1}
              >-</button>
              <span className="text-sm font-bold text-slate-700 px-2 min-w-[70px] text-center">Week {activeWeek}</span>
              <button 
                onClick={() => setActiveWeek(Math.min(durationWeeks, activeWeek + 1))}
                className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-slate-100 text-slate-600 disabled:opacity-30"
                disabled={activeWeek === durationWeeks}
              >+</button>
            </div>
          </div>
          
          <div className="px-4 pb-0 flex overflow-x-auto hide-scrollbar gap-1">
            {DAYS.map(day => (
              <button
                key={day}
                onClick={() => setActiveDay(day)}
                className={`px-6 py-3.5 text-sm font-bold uppercase tracking-wide border-b-2 transition-colors relative whitespace-nowrap ${
                  activeDay === day 
                    ? 'border-brand-500 text-brand-700' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {day}
                {exercises[day].length > 0 && (
                  <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-brand-500" />
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Builder Canvas */}
        <div 
          data-lenis-prevent
          className="flex-1 min-h-0 overflow-y-auto p-6 bg-slate-50/30"
        >
          
          <div className="max-w-3xl mx-auto space-y-4">
            
            {exercises[activeDay].length === 0 && !showSearch && (
              <div className="text-center py-16 px-4 border-2 border-dashed border-slate-200 rounded-3xl bg-white">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Dumbbell className="w-6 h-6 text-slate-400" />
                </div>
                <h3 className="text-lg font-bold text-slate-800 mb-1">Rest Day</h3>
                <p className="text-sm text-slate-500 mb-6">No exercises scheduled for {activeDay}.</p>
                <button 
                  onClick={() => setShowSearch(true)}
                  className="btn-primary inline-flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Add Exercise
                </button>
              </div>
            )}

            {/* Exercise Cards */}
            {exercises[activeDay].map((ex, index) => {
              const currentSets = ex.progressions[activeWeek] || []
              const hasPrevWeekSets = activeWeek > 1 && ex.progressions[activeWeek - 1]
              
              return (
                <div 
                  key={ex.id}
                  draggable={dragEnabledId === ex.id}
                  onDragStart={(e) => (dragItem.current = index)}
                  onDragEnter={(e) => (dragOverItem.current = index)}
                  onDragEnd={() => {
                    handleSort()
                    setDragEnabledId(null)
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden group/card transition-all hover:border-slate-300"
                >
                  {/* Card Header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <div className="flex items-center gap-3">
                      <div 
                        onMouseDown={() => setDragEnabledId(ex.id)}
                        onMouseUp={() => setDragEnabledId(null)}
                        className="cursor-grab active:cursor-grabbing p-1.5 -ml-2 text-slate-300 hover:text-slate-600 hover:bg-slate-100 rounded-lg"
                      >
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-slate-900">{ex.name}</h4>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] uppercase font-bold tracking-widest text-brand-600 bg-brand-50 px-2 py-0.5 rounded-md">{ex.type}</span>
                          <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500">{ex.target}</span>
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-1 opacity-0 group-hover/card:opacity-100 transition-opacity">
                      <button className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 hover:text-slate-700" title="Copy to Day">
                        <Copy className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => deleteExercise(ex.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Sets / Progression UI */}
                  <div className="p-5">
                    {currentSets.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50">
                        {hasPrevWeekSets ? (
                          <div className="space-y-3">
                            <p className="text-sm text-slate-500 font-medium">No sets planned for Week {activeWeek}.</p>
                            <button 
                              onClick={() => duplicatePreviousWeek(ex.id, activeWeek)}
                              className="px-4 py-2 text-xs font-bold bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-sm"
                            >
                              Copy from Week {activeWeek - 1}
                            </button>
                          </div>
                        ) : (
                          <button 
                            onClick={() => addSet(ex.id)}
                            className="text-sm font-bold text-brand-600 hover:text-brand-700"
                          >
                            + Add First Set
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {/* Headers */}
                        <div className="flex gap-2 px-2 pb-2 border-b border-slate-100">
                          <div className="w-8 flex-shrink-0 text-[10px] font-bold text-slate-400 uppercase text-center">Set</div>
                          {ex.type === 'Strength' && (
                            <>
                              <div className="flex-[2] text-[10px] font-bold text-slate-400 uppercase">Exercise</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Reps</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Weight</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase hidden sm:block">Rest</div>
                              <div className="w-16 text-[10px] font-bold text-slate-400 uppercase hidden md:block">RPE</div>
                            </>
                          )}
                          {ex.type === 'Cardio' && (
                            <>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Duration</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Intensity</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Distance</div>
                            </>
                          )}
                           {ex.type === 'Mobility' && (
                            <>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Hold Time</div>
                              <div className="flex-1 text-[10px] font-bold text-slate-400 uppercase">Rounds</div>
                            </>
                          )}
                        </div>
                        
                        {/* Rows */}
                        {currentSets.map((set, setIdx) => (
                          <div key={setIdx} className="flex gap-2 items-center group/row">
                            <div className="w-8 flex-shrink-0 flex items-center justify-center h-9 text-xs font-bold text-slate-400">
                              {setIdx + 1}
                            </div>
                            
                            {ex.type === 'Strength' && (
                              <>
                                <input value={set.exerciseName || ''} onChange={e => updateSet(ex.id, setIdx, 'exerciseName', e.target.value)} className="flex-[2] h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder={ex.name} title="Override exercise name for supersets/circuits" />
                                <input value={set.reps || ''} onChange={e => updateSet(ex.id, setIdx, 'reps', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="10" />
                                <input value={set.weight || ''} onChange={e => updateSet(ex.id, setIdx, 'weight', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="kg/lb" />
                                <input value={set.rest || ''} onChange={e => updateSet(ex.id, setIdx, 'rest', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none hidden sm:block" placeholder="90s" />
                                <input value={set.rpe || ''} onChange={e => updateSet(ex.id, setIdx, 'rpe', e.target.value)} className="w-16 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none hidden md:block" placeholder="@8" />
                              </>
                            )}

                             {ex.type === 'Cardio' && (
                              <>
                                <input value={set.duration || ''} onChange={e => updateSet(ex.id, setIdx, 'duration', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="20m" />
                                <input value={set.intensity || ''} onChange={e => updateSet(ex.id, setIdx, 'intensity', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="Zone 2" />
                                <input value={set.distance || ''} onChange={e => updateSet(ex.id, setIdx, 'distance', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="km/mi" />
                              </>
                            )}

                            {ex.type === 'Mobility' && (
                              <>
                                <input value={set.holdTime || ''} onChange={e => updateSet(ex.id, setIdx, 'holdTime', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="30s" />
                                <input value={set.rounds || ''} onChange={e => updateSet(ex.id, setIdx, 'rounds', e.target.value)} className="flex-1 h-9 bg-slate-50 hover:bg-white focus:bg-white border border-transparent focus:border-brand-500 rounded-lg px-3 text-sm font-semibold transition-all outline-none" placeholder="1" />
                              </>
                            )}
                          </div>
                        ))}
                        
                        <div className="pt-3 flex gap-2">
                          <button 
                            onClick={() => addSet(ex.id)}
                            className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 rounded-lg transition-colors border border-slate-100"
                          >
                            + Add Set
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}

            {/* Smart Search Autocomplete */}
            {(showSearch || exercises[activeDay].length > 0) && (
              <div className="mt-8 group/search">
                <div className="relative">
                  <div className="absolute left-4 top-1/2 -translate-y-1/2 w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center">
                    <Search className="w-4 h-4 text-slate-400" />
                  </div>
                  <input 
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      if (!showSearch) setShowSearch(true)
                    }}
                    onFocus={() => setShowSearch(true)}
                    className="w-full h-14 pl-14 pr-4 bg-white border border-slate-200 rounded-2xl shadow-sm text-sm font-bold text-slate-900 outline-none focus:border-brand-500 focus:ring-4 focus:ring-brand-500/10 transition-all placeholder:text-slate-400 placeholder:font-semibold"
                    placeholder="Search exercise library..."
                  />
                </div>
                
                {showSearch && searchQuery && (
                  <div 
                    data-lenis-prevent
                    className="mt-2 bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden max-h-[300px] overflow-y-auto"
                  >
                    {EXERCISE_LIBRARY.filter(ex => ex.name.toLowerCase().includes(searchQuery.toLowerCase())).map((ex, i) => (
                      <button
                        key={i}
                        onClick={() => addExercise(ex)}
                        className="w-full flex items-center justify-between p-4 hover:bg-slate-50 border-b border-slate-50 transition-colors text-left"
                      >
                        <div>
                          <p className="font-bold text-slate-900">{ex.name}</p>
                          <p className="text-xs font-semibold text-slate-400 mt-1">{ex.target} • {ex.equipment}</p>
                        </div>
                        <span className="text-[10px] uppercase font-bold tracking-widest text-brand-600 bg-brand-50 px-2 py-1 rounded-md">{ex.type}</span>
                      </button>
                    ))}
                    <button 
                      onClick={() => addExercise({ name: searchQuery, type: 'Strength', target: 'Custom', equipment: 'Custom' })}
                      className="w-full flex items-center gap-3 p-4 hover:bg-brand-50 transition-colors text-left text-brand-600 border-t border-slate-100 group/add"
                    >
                      <div className="w-8 h-8 rounded-lg bg-brand-100 flex items-center justify-center flex-shrink-0 group-hover/add:bg-brand-200 transition-colors">
                        <Plus className="w-4 h-4 text-brand-700" />
                      </div>
                      <div>
                        <p className="font-bold">Add new exercise "{searchQuery}"</p>
                        <p className="text-xs font-medium text-brand-600/70">Create a custom exercise on the fly</p>
                      </div>
                    </button>
                  </div>
                )}
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Right Sidebar */}
      <div className="w-full lg:w-80 flex flex-col justify-between min-h-0">
        <div className="card border-slate-200 overflow-hidden bg-white shadow-sm flex flex-col h-full rounded-3xl min-h-0">
          <div className="p-5 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-900">{programData.name || "Untitled"}</h3>
            <p className="text-xs font-semibold text-slate-500 mt-1 uppercase tracking-wider">{programData.duration} Weeks Plan</p>
          </div>
          
          <div 
            data-lenis-prevent
            className="p-5 overflow-y-auto flex-1 min-h-0"
          >
            <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-4">Live Program Structure</h4>
            
            <div className="space-y-4">
              {DAYS.map(day => (
                <div key={day} className="flex gap-3">
                  <div className="w-8 pt-0.5">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{day}</span>
                  </div>
                  <div className="flex-1">
                    {exercises[day].length === 0 ? (
                      <span className="text-xs font-semibold text-slate-300">Rest</span>
                    ) : (
                      <div className="space-y-1.5">
                        {exercises[day].map(ex => (
                          <div key={ex.id} className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                            <div className="w-1.5 h-1.5 rounded-full bg-brand-400" />
                            <span className="truncate">{ex.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
          
          <div className="p-5 border-t border-slate-100 bg-slate-50/50 space-y-3">
            <button 
              onClick={() => handleSave(false)}
              disabled={isPublishing || isSavingDraft}
              className="btn-primary w-full shadow-md shadow-brand-500/20 disabled:opacity-70 disabled:cursor-not-allowed"
            >
              {isPublishing ? 'Publishing...' : 'Publish Plan'}
            </button>
            <div className="flex gap-2">
              <button 
                onClick={onBack} 
                disabled={isPublishing || isSavingDraft}
                className="flex-1 py-2.5 text-sm font-bold text-slate-600 bg-white border border-slate-200 rounded-xl shadow-sm hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Back
              </button>
              <button 
                onClick={() => handleSave(true)}
                disabled={isPublishing || isSavingDraft}
                className="flex-1 py-2.5 text-sm font-bold text-brand-600 bg-brand-50 rounded-xl hover:bg-brand-100 transition-colors disabled:opacity-50"
              >
                {isSavingDraft ? 'Saving...' : 'Save Draft'}
              </button>
            </div>
          </div>
        </div>
      </div>
      
    </div>
  )
}
