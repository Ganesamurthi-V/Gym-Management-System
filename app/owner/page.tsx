import { redirect } from 'next/navigation'
import { OWNER_HOME } from '@/lib/protected-routes'

/**
 * `/owner` is a namespace, not a page. Anyone who lands on it bare (typed URL,
 * trimmed bookmark, PWA scope root) goes to the dashboard.
 */
export default function OwnerIndex() {
  redirect(OWNER_HOME)
}
