/**
 * Spreadsheet formula-injection guard for exported .xlsx cells.
 *
 * A text cell starting with = + - @ (or tab / CR) is run as a formula by Excel and
 * Sheets, so a member named `=HYPERLINK("http://evil",A1)` would execute when the
 * owner opens the export. OWASP's fix is a leading single quote, which spreadsheets
 * treat as "text" and do not display in the cell.
 *
 * Only strings are touched: numbers, dates, booleans and null pass through, and a
 * string that is just a plain number ("-5", "+12.5") is kept as is because it cannot
 * form a formula. Leading spaces are skipped when checking, since some apps trim them.
 */
const FORMULA_START = /^[\s\u0000-\u001f]*[=+\-@\t\r]/
const PLAIN_NUMBER = /^[+-]?\d+(\.\d+)?$/

/** Longest text kept in one exported cell (Excel's own hard limit is 32,767). */
export const MAX_EXPORT_CELL_LENGTH = 1000

export function sanitizeCell<T>(value: T): T | string {
  if (typeof value !== 'string') return value
  const capped = value.length > MAX_EXPORT_CELL_LENGTH ? value.slice(0, MAX_EXPORT_CELL_LENGTH) : value
  if (PLAIN_NUMBER.test(capped)) return capped
  return FORMULA_START.test(capped) ? `'${capped}` : capped
}

/** Sanitises every string value of a row object, for `worksheet.addRow({...})`. */
export function sanitizeRow<T extends Record<string, unknown>>(row: T): Record<keyof T, unknown> {
  const out = {} as Record<keyof T, unknown>
  for (const key of Object.keys(row) as (keyof T)[]) out[key] = sanitizeCell(row[key])
  return out
}
