/**
 * lib/import/storage.ts
 * ─────────────────────
 * Single source of truth for the browser storage the multi-step import wizard
 * uses to carry parsed rows between /owner/import → /review → /edit.
 *
 * ─── Why this exists ────────────────────────────────────────────────────────
 * These entries hold real member PII — names, phone numbers, ages, dates of
 * birth and areas — for the whole CSV being imported, and in up to three
 * simultaneous copies (`import_rows`, `import_rows_original`,
 * `import_review_state`).
 *
 * The wizard genuinely needs this: it spans three separate page navigations, so
 * the rows cannot live in React state. `sessionStorage` (not `localStorage`) is
 * the right store because it is scoped to the tab and dropped when the tab
 * closes. What was missing was disciplined teardown — the success path cleared
 * only `import_rows` and `import_rows_original`, leaving `import_review_state`
 * (a full third copy of every member's PII) readable by any script on the origin
 * for the rest of the browsing session.
 *
 * Keeping the key list here means a new stage cannot be added to the wizard and
 * silently escape cleanup, which is exactly how the previous gap appeared.
 */

/** Every wizard storage key. Add new wizard state here, never inline. */
export const IMPORT_STORAGE_KEYS = [
  'import_rows',
  'import_rows_original',
  'import_review_state',
  'import_cluster',
  'import_has_id_col',
  'import_file_name',
  'import_file_headers',
  'import_file_samples',
  'import_column_mapping',
  'import_unmapped_plans',
  'import_plan_mapping',
  'import_plan_mapping_applied',
  'import_column_mapping_applied',
  // The parsed sheet held while plans are mapped: a full copy of every row.
  'import_temp_state',
  'import_max_step',
] as const

export type ImportStorageKey = (typeof IMPORT_STORAGE_KEYS)[number]

/**
 * Remove every trace of the in-progress import from browser storage.
 *
 * Call this whenever the wizard reaches a terminal state: a completed import, an
 * abandoned one, or the start of a fresh upload. Safe to call during SSR and
 * safe to call twice.
 */
export function clearImportStorage(): void {
  removeImportKeys(...IMPORT_STORAGE_KEYS)
}

/**
 * Remove some of the wizard's entries — for a step that rebuilds what the later
 * steps derived from it (re-reading the sheet invalidates the plan mapping and
 * the area review) while the import itself carries on.
 *
 * Wizard pages call this instead of `sessionStorage.removeItem` so that every key
 * they touch is checked against IMPORT_STORAGE_KEYS by the compiler: a key that
 * is not in the list, and so would never be cleared at the end, does not compile.
 */
export function removeImportKeys(...keys: ImportStorageKey[]): void {
  if (typeof window === 'undefined') return
  for (const key of keys) {
    try {
      sessionStorage.removeItem(key)
    } catch {
      // Private-mode / quota-restricted browsers can throw on storage access.
      // Nothing useful to do, and never worth breaking the import over.
    }
  }
}
