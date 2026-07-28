import { QrCode } from 'lucide-react'
import { FoundationPage } from '@/components/ui/FoundationPage'

export default function MembershipCardPage() {
  return <FoundationPage title="Membership Card" description="The signed, auto-refreshing 256px membership QR card arrives in the attendance milestone." icon={QrCode} accentClass="bg-brand-50 text-brand-700" />
}
