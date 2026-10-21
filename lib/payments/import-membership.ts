/**
 * A membership written by the Excel/CSV import (app/api/import/confirm) is a record of a plan the
 * member already paid for before joining GymFlow, not money collected today, so it must not count
 * toward a collection total.
 *
 * The import stamps `created_at` as exactly midnight UTC of `start_date`; a real sale or renewal is
 * stamped with the moment it was entered. Together with `members.is_imported` that identifies the
 * import row precisely, so a later renewal by an imported member still counts as a collection.
 * Keep in sync with the same rule in get_gym_dashboard() (supabase-schema.sql).
 */
export function isImportedMembership(m: {
  created_at: string
  start_date: string
  member?: { is_imported?: boolean | null } | null
}): boolean {
  if (!m.member?.is_imported) return false
  return Date.parse(m.created_at) === Date.parse(`${m.start_date}T00:00:00Z`)
}
