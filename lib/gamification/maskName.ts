/**
 * "Akhil Prasad" -> "Akhil P."
 *
 * What one member sees of another on a leaderboard: enough to recognise a
 * friend, not enough to identify a stranger. Mirrors the SQL function
 * `gamification_mask_name`, which is what actually protects the name — a member
 * never receives the full name in the first place. This copy exists for
 * owner-side previews ("this is how members see it") and for tests.
 *
 * - whitespace is collapsed and trimmed
 * - single-word names are returned unchanged
 * - case is left exactly as typed (no initcap: "AKHIL" stays "AKHIL")
 * - the initial is the first code point, so Tamil and other non-Latin names work
 */
export function maskName(name: string | null | undefined): string {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  const initial = Array.from(parts[parts.length - 1])[0] ?? ''
  return `${parts[0]} ${initial}.`
}
