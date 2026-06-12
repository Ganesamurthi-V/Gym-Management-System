'use client'

import { useState } from 'react'
import { ChevronDown, ChevronRight, Check, Activity, Target, Users, Dumbbell, ArrowRight } from 'lucide-react'

export interface ProgramSetupData {
  name: string;
  summary: string;
  notes: string;
  duration: string;
  frequency: string;
  difficulty: string;
  goal: string;
  category: string;
  equipment: string;
  targetAudience: string;
  experienceLevel: string;
}

interface Props {
  data: ProgramSetupData;
  updateData: (data: Partial<ProgramSetupData>) => void;
  onNext: () => void;
}

export default function ProgramSetupForm({ data, updateData, onNext }: Props) {
  const [showNotes, setShowNotes] = useState(!!data.notes)

  const handleUpdate = (field: keyof ProgramSetupData, value: string) => {
    updateData({ [field]: value })
  }

  // Generate a mock schedule for the preview sidebar based on frequency
  const frequencyInt = parseInt(data.frequency) || 3
  const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const mockSchedule = weekDays.slice(0, frequencyInt).map((day, i) => {
    const splits = ['Chest', 'Back', 'Legs', 'Shoulders/Arms', 'Full Body', 'Cardio', 'Active Recovery']
    return { day, focus: splits[i % splits.length] }
  })

  return (
    <div className="flex-1 w-full flex flex-col lg:flex-row gap-8 max-w-7xl mx-auto">
      {/* Main Form Area */}
      <div className="flex-1 space-y-8">
        
        {/* Section 1: Program Information */}
        <section className="card p-6 border border-slate-100 shadow-sm rounded-2xl bg-white">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-brand-50 flex items-center justify-center">
              <Dumbbell className="w-4 h-4 text-brand-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Program Information</h2>
          </div>
          
          <div className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Workout Plan Name <span className="text-red-500">*</span></label>
              <input 
                type="text" 
                value={data.name}
                onChange={e => handleUpdate('name', e.target.value)}
                className="input-field text-base font-semibold" 
                placeholder="e.g., 12-Week Powerbuilding Phase 1" 
              />
            </div>
            
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Short Summary</label>
              <input 
                type="text" 
                value={data.summary}
                onChange={e => handleUpdate('summary', e.target.value)}
                className="input-field bg-slate-50 text-sm" 
                placeholder="A high-volume hypertrophy program focused on the big three lifts." 
              />
            </div>

            <div>
              <button 
                type="button"
                onClick={() => setShowNotes(!showNotes)}
                className="flex items-center gap-2 text-sm font-semibold text-brand-600 hover:text-brand-700 transition-colors py-1"
              >
                {showNotes ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                {showNotes ? "Hide Detailed Notes" : "Add Detailed Notes (Optional)"}
              </button>
              
              {showNotes && (
                <div className="mt-3 animate-in slide-in-from-top-2 fade-in duration-200">
                  <textarea 
                    value={data.notes}
                    onChange={e => handleUpdate('notes', e.target.value)}
                    className="input-field min-h-[120px] text-sm leading-relaxed" 
                    placeholder="Include background info, warm-up instructions, or diet recommendations..." 
                  />
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Section 2: Program Setup */}
        <section className="card p-6 border border-slate-100 shadow-sm rounded-2xl bg-white">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
              <Activity className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Program Setup</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Duration (Weeks)</label>
              <select value={data.duration} onChange={e => handleUpdate('duration', e.target.value)} className="input-field">
                {[4, 6, 8, 10, 12, 16].map(w => <option key={w} value={w}>{w} Weeks</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Frequency (Days/Week)</label>
              <select value={data.frequency} onChange={e => handleUpdate('frequency', e.target.value)} className="input-field">
                {[1, 2, 3, 4, 5, 6, 7].map(d => <option key={d} value={d}>{d} Days</option>)}
              </select>
            </div>
          </div>

          <div className="mb-6">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Difficulty Level</label>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {['Beginner', 'Intermediate', 'Advanced'].map(level => (
                <button
                  key={level}
                  onClick={() => handleUpdate('difficulty', level)}
                  className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${
                    data.difficulty === level 
                      ? 'bg-white text-slate-900 shadow-sm' 
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-200/50'
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Training Goal</label>
              <select value={data.goal} onChange={e => handleUpdate('goal', e.target.value)} className="input-field text-sm">
                <option value="Build Muscle">Build Muscle</option>
                <option value="Lose Fat">Lose Fat</option>
                <option value="Improve Strength">Improve Strength</option>
                <option value="Endurance">Endurance</option>
                <option value="Athletic Performance">Athletic Performance</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Category</label>
              <select value={data.category} onChange={e => handleUpdate('category', e.target.value)} className="input-field text-sm">
                <option value="Strength">Strength</option>
                <option value="Hypertrophy">Hypertrophy</option>
                <option value="Fat Loss">Fat Loss</option>
                <option value="Powerlifting">Powerlifting</option>
                <option value="Mobility">Mobility</option>
                <option value="CrossFit">CrossFit</option>
                <option value="Functional Fitness">Functional Fitness</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Equipment</label>
              <select value={data.equipment} onChange={e => handleUpdate('equipment', e.target.value)} className="input-field text-sm">
                <option value="Full Gym">Full Gym</option>
                <option value="Dumbbells Only">Dumbbells Only</option>
                <option value="Home Workout">Home Workout</option>
                <option value="Resistance Bands">Resistance Bands</option>
                <option value="Machines Only">Machines Only</option>
              </select>
            </div>
          </div>
        </section>

        {/* Section 3: Audience */}
        <section className="card p-6 border border-slate-100 shadow-sm rounded-2xl bg-white">
          <div className="flex items-center gap-2 mb-5 pb-3 border-b border-slate-100">
            <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center">
              <Users className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Target Audience</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Primary Demographic</label>
              <select value={data.targetAudience} onChange={e => handleUpdate('targetAudience', e.target.value)} className="input-field">
                <option value="Everyone">Everyone</option>
                <option value="Men">Men</option>
                <option value="Women">Women</option>
                <option value="Athletes">Athletes</option>
                <option value="Seniors">Seniors</option>
                <option value="Beginners">Beginners</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Experience Level</label>
              <select value={data.experienceLevel} onChange={e => handleUpdate('experienceLevel', e.target.value)} className="input-field">
                <option value="Newbie">Newbie</option>
                <option value="Recreational">Recreational</option>
                <option value="Serious Trainee">Serious Trainee</option>
                <option value="Competitive Athlete">Competitive Athlete</option>
              </select>
            </div>
          </div>
        </section>

      </div>

      {/* Right Sidebar: Preview & CTA */}
      <div className="w-full lg:w-80 flex flex-col gap-6">
        <div className="card p-5 border border-slate-200 bg-white shadow-sm sticky top-24 rounded-2xl">
          <div className="flex flex-col items-center text-center pb-5 mb-5 border-b border-slate-100">
            <div className="w-12 h-12 bg-slate-100 rounded-2xl flex items-center justify-center mb-3">
              <Target className="w-6 h-6 text-slate-600" />
            </div>
            <h3 className="font-bold text-slate-900">{data.name || "Untitled Program"}</h3>
            <p className="text-xs font-medium text-slate-500 mt-1 uppercase tracking-wider">
              {data.duration} Weeks • {data.difficulty}
            </p>
          </div>

          <div className="mb-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">Live Preview (Week 1)</h4>
            <div className="space-y-2">
              {mockSchedule.map((item, index) => (
                <div key={index} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="text-xs font-bold text-slate-700 w-10">{item.day}</span>
                  <span className="text-xs font-semibold text-slate-500 flex-1 flex items-center gap-1.5">
                    <ArrowRight className="w-3 h-3 text-brand-400" />
                    {item.focus}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button 
            onClick={onNext}
            disabled={!data.name.trim()}
            className="btn-primary w-full flex justify-center items-center gap-2 py-3.5 shadow-md shadow-brand-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue to Builder
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>

    </div>
  )
}
