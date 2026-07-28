import { CreditCard } from 'lucide-react'
import { FoundationPage } from '@/components/ui/FoundationPage'

export default function MembershipPage() {
  return <FoundationPage title="Membership" description="Your active plan, expiry, benefits, renewal options, and payment status arrive in the core member milestone." icon={CreditCard} accentClass="bg-brand-50 text-brand-700" />
}
