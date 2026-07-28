import { UserRound } from 'lucide-react'
import { LogoutButton } from '@/components/auth/LogoutButton'
import { FoundationPage } from '@/components/ui/FoundationPage'

export default function ProfilePage() {
  return (
    <FoundationPage title="Profile" description="Personal details, emergency contact, medical notes, and notification settings arrive in the core member milestone." icon={UserRound} accentClass="bg-violet-50 text-violet-700">
      <LogoutButton />
    </FoundationPage>
  )
}
