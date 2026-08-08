import { redirect } from 'next/navigation'
import { MEMBER_HOME } from '@/lib/member/redirect'

/**
 * `/m` is a namespace, not a page. Anyone who lands on it bare (typed URL,
 * trimmed bookmark, PWA scope root) goes to member home.
 *
 * The authorization check still runs first: this renders inside
 * `app/m/layout.tsx`, which rejects any user without a linked member row.
 */
export default function MemberIndex() {
  redirect(MEMBER_HOME)
}
