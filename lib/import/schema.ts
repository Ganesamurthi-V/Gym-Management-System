/**
 * lib/import/schema.ts
 * ────────────────────
 * Server-side contract for POST /api/import/confirm and the size limits the
 * browser applies before it parses a spreadsheet. The browser's parsing is only
 * a convenience: anything it sends is untrusted, so every field is re-validated
 * here. Unknown keys (notably `gym_id`) are stripped, never read.
 */
import { z } from 'zod'

export const MAX_IMPORT_ROWS = 500
/** Raw request body cap for the confirm route (500 rows is well under 300 KB). */
export const MAX_CONFIRM_BODY_BYTES = 1_000_000

// Browser-side limits, enforced before/while ExcelJS reads the file.
export const MAX_IMPORT_FILE_BYTES = 10 * 1024 * 1024
/** Rows the sheet may hold before we stop reading it (confirm still caps at 500 per request). */
export const MAX_SHEET_ROWS = 50_000
export const MAX_SHEET_COLUMNS = 60
export const MAX_IMPORT_CELL_LENGTH = 500
/** Uncompressed xlsx size guard: a zip bomb is small on disk and huge once inflated. */
export const MAX_XLSX_UNCOMPRESSED_BYTES = 80 * 1024 * 1024

export type FileCheck = { ok: true } | { ok: false; message: string }

/** Cheap checks on the picked file before any parsing starts. */
export function checkImportFile(file: { name: string; size: number }): FileCheck {
  if (file.size > MAX_IMPORT_FILE_BYTES) return { ok: false, message: 'File too large. Maximum size is 10MB.' }
  if (file.size === 0) return { ok: false, message: 'The file is empty.' }
  if (!/\.(csv|xlsx|xls)$/i.test(file.name)) return { ok: false, message: 'Please choose a .csv or .xlsx file.' }
  return { ok: true }
}

/**
 * Reads the central directory of a zip (.xlsx) and returns the total declared
 * uncompressed size, or null when it is not a readable zip. Used to refuse a
 * decompression bomb before ExcelJS inflates it into memory.
 */
export function declaredUncompressedSize(buf: ArrayBuffer): number | null {
  const v = new DataView(buf)
  const len = buf.byteLength
  if (len < 22) return null
  // End-of-central-directory record: scan back over at most the 64 KB comment.
  let eocd = -1
  for (let i = len - 22; i >= Math.max(0, len - 22 - 65535); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) return null
  const entries = v.getUint16(eocd + 10, true)
  let p = v.getUint32(eocd + 16, true)
  let total = 0
  for (let n = 0; n < entries; n++) {
    if (p + 46 > len || v.getUint32(p, true) !== 0x02014b50) return null
    total += v.getUint32(p + 24, true)
    p += 46 + v.getUint16(p + 28, true) + v.getUint16(p + 30, true) + v.getUint16(p + 32, true)
  }
  return total
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const isRealDate = (s: string) => {
  if (!ISO_DATE.test(s)) return false
  const d = new Date(`${s}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s && Number(s.slice(0, 4)) >= 1900
}

/** Empty string / null / undefined all mean "not provided". */
const blankToUndef = (v: unknown) => (v === '' || v === null ? undefined : v)
const str = (max: number) => z.string().max(max).transform(s => s.trim())
/* eslint-disable-next-line no-control-regex */
const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g
const text = (max: number) => str(max).transform(s => s.replace(CONTROL, ''))

const intFrom = (min: number, max: number) =>
  z.preprocess(blankToUndef, z.union([z.number(), z.string().max(20)]).optional())
    .transform((v, ctx) => {
      if (v === undefined) return undefined
      const n = typeof v === 'number' ? v : (/^\s*\d+\s*$/.test(v) ? Number(v) : NaN)
      if (!Number.isInteger(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: `must be a whole number from ${min} to ${max}` })
        return z.NEVER
      }
      return n
    })

export const importRowSchema = z.object({
  name: text(255).refine(s => s.length > 0, 'name is required'),
  // Normalised (and the invalid sentinel applied) by normalizePhoneForImport afterwards.
  phone: z.preprocess(blankToUndef, z.union([z.string().max(40), z.number()]).optional()),
  // Soft fields: a bad value falls back to "not provided" (as the route always did)
  // instead of failing a 500-row import for one cell. Structural limits stay strict.
  age: intFrom(1, 120).catch(undefined),
  gender: z.preprocess(blankToUndef, z.enum(['male', 'female', 'other']).optional().catch(undefined)),
  date_of_birth: z.preprocess(blankToUndef, z.string().refine(isRealDate, 'invalid date').optional().catch(undefined)),
  area: z.preprocess(blankToUndef, text(100).optional()),
  // A request only: the route confirms it is free before using it.
  member_number: intFrom(1, 9_999_999),
  legacy_member_id: z.preprocess(blankToUndef, text(50).optional()),
  plan: z.preprocess(blankToUndef, z.enum(['monthly', 'quarterly', 'annual']).default('monthly')),
  category: z.preprocess(blankToUndef, z.enum(['strength', 'cardio', 'both']).catch('both').default('both')),
  start_date: z.preprocess(blankToUndef, z.string().refine(isRealDate, 'invalid date').optional().catch(undefined)),
  // INR, whole rupees. Upper bound keeps sums and the int column safe.
  amount: intFrom(0, 10_000_000).transform(v => v ?? 0),
  payment_mode: z.preprocess(blankToUndef, z.enum(['cash', 'upi', 'card']).catch('cash').default('cash')),
})

export const importConfirmSchema = z.object({
  rows: z.array(importRowSchema).min(1, 'Rows are required').max(MAX_IMPORT_ROWS, `Maximum ${MAX_IMPORT_ROWS} rows per import`),
})

export type ImportRow = z.infer<typeof importRowSchema>
