/**
 * lib/import/api-errors.ts
 * ────────────────────────
 * Turns whatever came back from an import request into a sentence an owner can
 * act on.
 *
 * When a request fails before our route's own error handling runs — the host
 * kills a slow function, a body is over a size limit, the session lapsed — the
 * reply is an HTML page, not our JSON. Reading that as JSON threw
 * `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` straight into the
 * UI. Nothing here exposes status codes, JSON, or exception text to the owner.
 */

export class ImportRequestError extends Error {
  constructor(message: string, readonly status: number | null = null) {
    super(message)
    this.name = 'ImportRequestError'
  }
}

/** The owner-facing sentence for an HTTP status that arrived without our JSON. */
export function messageForStatus(status: number): string {
  if (status === 401 || status === 403) return 'Your session has expired. Please log in again, then retry the import. Your file is still here.'
  if (status === 408 || status === 504) return 'The import took too long and was stopped. Some members may already have been added, so check the Members page before trying again.'
  if (status === 413) return 'This file is too large to import in one go. Split it into smaller files of up to 500 members each and import them one after another.'
  if (status === 429) return 'Too many import attempts in a short time. Please wait a minute and try again.'
  if (status >= 500) return 'Something went wrong on our side. Some members may already have been added, so check the Members page before trying again.'
  return 'The import could not be completed. Please try again.'
}

/**
 * Reads an import response. Returns our JSON body whether the request succeeded
 * or not (callers look at `success`), and throws an ImportRequestError with a
 * plain message when the reply is not our JSON at all.
 */
export async function readImportResponse<T = unknown>(res: Response): Promise<T> {
  const text = await res.text()
  try {
    return JSON.parse(text) as T
  } catch {
    throw new ImportRequestError(messageForStatus(res.status), res.status)
  }
}

/** Any thrown value, as the message to show. Network drops get their own wording. */
export function importErrorMessage(err: unknown): string {
  if (err instanceof ImportRequestError) return err.message
  if (err instanceof TypeError) {
    return 'Could not reach the server. Check your internet connection and try again. Your file is still here.'
  }
  return 'The import could not be completed. Please try again.'
}

/**
 * The message for an error our own routes returned. Their codes are stable;
 * their wording is written for developers, so the common ones are replaced.
 */
export function messageForApiError(error: { code?: string; message?: string } | undefined): string {
  switch (error?.code) {
    case 'UNAUTHORIZED': return messageForStatus(401)
    case 'RATE_LIMITED': return messageForStatus(429)
    case 'NOT_FOUND': return 'We could not find your gym. Please log out, log in again, and retry.'
    default: return error?.message?.trim() || messageForStatus(500)
  }
}
