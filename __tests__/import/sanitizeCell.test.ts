import { describe, it, expect } from 'vitest'
import { sanitizeCell, sanitizeRow, MAX_EXPORT_CELL_LENGTH } from '@/lib/export/sanitizeCell'

describe('sanitizeCell', () => {
  it.each(['=1+1', '+cmd|x', '-2+3', '@SUM(A1)', '\tx', '\rx', '=HYPERLINK("http://e","a")', '  =1+1'])(
    'prefixes a quote on %j', v => {
      expect(sanitizeCell(v)).toBe(`'${v}`)
    })
  it('leaves normal text, unicode and plain numbers alone', () => {
    for (const v of ['Akhil P.', 'அகில்', 'Anna Nagar', '', '9876543210', '-5', '+12.5', 'a=b', '१२३']) {
      expect(sanitizeCell(v)).toBe(v)
    }
  })
  it('passes non-strings through untouched', () => {
    const d = new Date()
    expect(sanitizeCell(42)).toBe(42)
    expect(sanitizeCell(-7)).toBe(-7)
    expect(sanitizeCell(d)).toBe(d)
    expect(sanitizeCell(null)).toBeNull()
    expect(sanitizeCell(undefined)).toBeUndefined()
    expect(sanitizeCell(true)).toBe(true)
  })
  it('caps very long text', () => {
    expect(sanitizeCell('x'.repeat(100000)) as string).toHaveLength(MAX_EXPORT_CELL_LENGTH)
  })
  it('sanitises every field of a row', () => {
    expect(sanitizeRow({ name: '=evil()', dues: 100, phone: '+91 98765 43210' })).toEqual({
      name: "'=evil()", dues: 100, phone: "'+91 98765 43210",
    })
  })
})

import { cellStr, excelSerialToDate } from '@/lib/import/normalizers'

describe('import cell reading (plain values only)', () => {
  it('reads formula results, hyperlink text and rich text, never formulas or URLs', () => {
    expect(cellStr({ formula: 'HYPERLINK("http://evil","x")', result: 'shown' })).toBe('shown')
    expect(cellStr({ text: 'Akhil', hyperlink: 'http://evil' })).toBe('Akhil')
    expect(cellStr({ richText: [{ text: 'Ak' }, { text: 'hil' }] })).toBe('Akhil')
    expect(cellStr({ error: '#N/A' })).toBe('')
    expect(cellStr({ weird: true })).toBe('')
  })
  it('caps cell length and survives an invalid date serial', () => {
    expect(cellStr('x'.repeat(5000))).toHaveLength(500)
    expect(excelSerialToDate(1e20)).toBe('')
  })
})
