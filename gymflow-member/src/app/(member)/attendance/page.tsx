import { CalendarCheck } from 'lucide-react'
import { FoundationPage } from '@/components/ui/FoundationPage'

export default function AttendancePage() {
  return <FoundationPage title="Attendance" description="Calendar history, streaks, monthly stats, and realtime check-in confirmation arrive in the attendance milestone." icon={CalendarCheck} accentClass="bg-emerald-50 text-emerald-700" />
}
