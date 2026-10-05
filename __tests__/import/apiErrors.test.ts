/**
 * An import request that fails upstream of our route answers with an HTML page.
 * The owner must read a sentence, never `Unexpected token '<'`.
 */

import { describe, it, expect } from 'vitest'
import { ImportRequestError, importErrorMessage, messageForApiError, messageForStatus, readImportResponse } from '@/lib/import/api-errors'

const html = (status: number) => new Response('<!DOCTYPE html><html><body>Gateway Timeout</body></html>', { status })

const failure = async (res: Response): Promise<ImportRequestError> => {
  try { await readImportResponse(res) } catch (e) { return e as ImportRequestError }
  throw new Error('expected readImportResponse to throw')
}

describe('readImportResponse', () => {
  it('returns our JSON, success or failure', async () => {
    const ok = await readImportResponse(new Response(JSON.stringify({ success: true, data: { n: 1 } })))
    expect(ok).toEqual({ success: true, data: { n: 1 } })
    const bad = await readImportResponse(new Response(JSON.stringify({ success: false }), { status: 400 }))
    expect(bad).toEqual({ success: false })
  })

  it('turns an HTML error page into a plain sentence', async () => {
    for (const status of [401, 413, 429, 500, 502, 504]) {
      const err = await failure(html(status))
      expect(err).toBeInstanceOf(ImportRequestError)
      expect(err.message).toBe(messageForStatus(status))
      expect(err.message).not.toMatch(/token|JSON|DOCTYPE|<|HTTP|status/i)
    }
  })

  it('handles an empty body', async () => {
    const err = await failure(new Response('', { status: 504 }))
    expect(err.message).toBe(messageForStatus(504))
  })
})

describe('messages', () => {
  it('tell the owner whether members may already have been added', () => {
    expect(messageForStatus(504)).toMatch(/check the Members page/)
    expect(messageForStatus(500)).toMatch(/check the Members page/)
    expect(messageForStatus(413)).toMatch(/Split it/)
    expect(messageForStatus(401)).toMatch(/log in again/)
  })

  it('names a dropped connection', () => {
    expect(importErrorMessage(new TypeError('Failed to fetch'))).toMatch(/internet connection/)
    expect(importErrorMessage(new Error('boom'))).toBe('The import could not be completed. Please try again.')
  })

  it('rewrites our own route codes and keeps specific messages', () => {
    expect(messageForApiError({ code: 'UNAUTHORIZED', message: 'Unauthorized' })).toBe(messageForStatus(401))
    expect(messageForApiError({ code: 'RATE_LIMITED', message: 'Rate limit exceeded' })).toBe(messageForStatus(429))
    expect(messageForApiError({ code: 'BAD_REQUEST', message: 'Maximum 500 rows per import' })).toBe('Maximum 500 rows per import')
    expect(messageForApiError(undefined)).toBe(messageForStatus(500))
  })
})
