/**
 * Tests for import-wizard browser storage teardown (lib/import/storage.ts).
 *
 * The audit flagged that the import wizard keeps member PII (names, phones,
 * ages, DOB, areas) in sessionStorage across three page navigations.
 *
 * The concrete defect: the successful-import path cleared only `import_rows` and
 * `import_rows_original`, leaving `import_review_state` — a full third copy of
 * every imported member's PII — readable by any script on the origin for the
 * rest of the browsing session.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import { IMPORT_STORAGE_KEYS, clearImportStorage } from '@/lib/import/storage'

/** Minimal in-memory sessionStorage stand-in (tests run in the node env). */
function installFakeSessionStorage() {
  const store = new Map<string, string>()
  vi.stubGlobal('window', {} as unknown as Window)
  vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, String(v)) },
    removeItem: (k: string) => { store.delete(k) },
    clear: () => store.clear(),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() { return store.size },
  })
  return store
}

const SAMPLE_PII = JSON.stringify([{ name: 'Arjun', phone: '919876543210', age: 28 }])

describe('IMPORT_STORAGE_KEYS', () => {
  it('lists every wizard key, including the one the old cleanup missed', () => {
    expect([...IMPORT_STORAGE_KEYS]).toEqual([
      'import_rows',
      'import_rows_original',
      'import_review_state',
      'import_cluster',
      'import_has_id_col',
    ])
  })
})

describe('clearImportStorage', () => {
  let store: Map<string, string>

  beforeEach(() => { store = installFakeSessionStorage() })
  afterEach(() => { vi.unstubAllGlobals() })

  it('removes every PII-bearing wizard key', () => {
    for (const k of IMPORT_STORAGE_KEYS) sessionStorage.setItem(k, SAMPLE_PII)
    expect(store.size).toBe(IMPORT_STORAGE_KEYS.length)

    clearImportStorage()

    expect(store.size).toBe(0)
    for (const k of IMPORT_STORAGE_KEYS) {
      expect(sessionStorage.getItem(k), k).toBeNull()
    }
  })

  it('clears import_review_state — the copy the old success path left behind', () => {
    sessionStorage.setItem('import_review_state', SAMPLE_PII)
    clearImportStorage()
    expect(sessionStorage.getItem('import_review_state')).toBeNull()
  })

  it('leaves unrelated keys untouched', () => {
    sessionStorage.setItem('gymflow_sidebar_collapsed', 'true')
    sessionStorage.setItem('import_rows', SAMPLE_PII)

    clearImportStorage()

    expect(sessionStorage.getItem('import_rows')).toBeNull()
    expect(sessionStorage.getItem('gymflow_sidebar_collapsed')).toBe('true')
  })

  it('is idempotent', () => {
    sessionStorage.setItem('import_rows', SAMPLE_PII)
    clearImportStorage()
    expect(() => clearImportStorage()).not.toThrow()
    expect(store.size).toBe(0)
  })

  it('survives a storage backend that throws (private mode / quota)', () => {
    vi.stubGlobal('window', {} as unknown as Window)
    vi.stubGlobal('sessionStorage', {
      removeItem: () => { throw new Error('SecurityError: storage disabled') },
    })
    expect(() => clearImportStorage()).not.toThrow()
  })

  it('is a no-op during SSR (no window)', () => {
    vi.unstubAllGlobals()
    expect(() => clearImportStorage()).not.toThrow()
  })
})

describe('regression guard — wizard pages must use the shared helper', () => {
  const WIZARD_PAGES = [
    'app/owner/import/page.tsx',
    'app/owner/import/edit/page.tsx',
  ]

  it('no wizard page inlines removeItem for the PII keys', () => {
    // Inlining the list is how the original gap appeared: one call site listed
    // 5 keys, the other listed only 2.
    for (const page of WIZARD_PAGES) {
      const src = fs.readFileSync(page, 'utf8')
      for (const key of IMPORT_STORAGE_KEYS) {
        expect(src, `${page} still inlines removeItem("${key}")`)
          .not.toContain(`removeItem("${key}")`)
      }
    }
  })

  it('the success path in the edit page calls clearImportStorage', () => {
    const src = fs.readFileSync('app/owner/import/edit/page.tsx', 'utf8')
    expect(src).toContain('clearImportStorage()')
    // It must run before the wizard switches to the terminal "done" screen.
    const clearIdx = src.indexOf('clearImportStorage()')
    const doneIdx = src.indexOf('setStep("done")')
    expect(clearIdx).toBeGreaterThan(-1)
    expect(doneIdx).toBeGreaterThan(-1)
    expect(clearIdx).toBeLessThan(doneIdx)
  })
})
