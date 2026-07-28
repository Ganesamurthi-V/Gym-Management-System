import { Dumbbell } from 'lucide-react'
import { FoundationPage } from '@/components/ui/FoundationPage'

export default function WorkoutPage() {
  return <FoundationPage title="Workout" description="Assigned plans and active workout tracking arrive in the workout milestone." icon={Dumbbell} accentClass="bg-orange-50 text-orange-600" />
}
