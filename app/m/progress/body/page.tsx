import { redirect } from 'next/navigation'

// The body screen is now the Progress tab itself. Push notifications still deep-link here.
export default function BodyProgressPage() {
  redirect('/m/progress')
}
