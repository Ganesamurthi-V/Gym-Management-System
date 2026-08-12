/**
 * lib/api/client.ts
 * ─────────────────
 * GymFlow browser API client.
 *
 * Every browser→server call should go through here. The browser then only ever
 * talks to our own origin — never to `*.supabase.co` — so the Supabase project
 * hostname and anon key stay out of the Network tab and out of the JS bundle.
 *
 * Two things this gives us beyond a bare `fetch`:
 *   1. `credentials: 'include'` on every request, so the HttpOnly Supabase SSR
 *      session cookie is always sent.
 *   2. `X-Requested-With: XMLHttpRequest` on every request. Browsers will not
 *      let a cross-origin form or simple `<img>`/`<script>` request set a custom
 *      header without a CORS preflight, so requiring it server-side (see
 *      `lib/api/withAuth.ts`) blocks classic CSRF.
 */

/**
 * Base URL for API calls.
 *
 * Relative URLs are used when `NEXT_PUBLIC_API_URL` is unset or matches the
 * current origin, which keeps requests same-origin (no CORS preflight, cookies
 * sent by default). An absolute value is only needed if the API is served from a
 * different hostname than the app.
 */
function resolveBase(): string {
  const configured = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, '')
  if (!configured) return ''
  if (typeof window !== 'undefined' && configured === window.location.origin) return ''
  return configured
}

export class GymFlowAPIError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'GymFlowAPIError'
  }

  /** The session is gone or was rejected — caller should send the user to login. */
  get isUnauthorized(): boolean {
    return this.status === 401
  }

  /** Rate limited — caller should back off and retry later. */
  get isRateLimited(): boolean {
    return this.status === 429
  }
}

type Json = Record<string, unknown> | unknown[] | null

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response
  try {
    res = await fetch(`${resolveBase()}${path}`, {
      method,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  } catch (err) {
    // Network-level failure (offline, DNS, aborted). Surface it in the same
    // shape as an API error so callers only need one catch path.
    throw new GymFlowAPIError(
      0,
      'NETWORK_ERROR',
      err instanceof Error ? err.message : 'Network request failed',
    )
  }

  if (!res.ok) {
    let parsed: { error?: { code?: string; message?: string } } = {}
    try { parsed = await res.json() } catch { /* non-JSON error body */ }
    throw new GymFlowAPIError(
      res.status,
      parsed.error?.code ?? 'UNKNOWN',
      parsed.error?.message ?? `HTTP ${res.status}`,
    )
  }

  // 204 No Content and empty bodies must not go through res.json().
  if (res.status === 204) return undefined as T
  const text = await res.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

export const api = {
  get:    <T = Json>(path: string)                => request<T>('GET', path),
  post:   <T = Json>(path: string, body?: unknown) => request<T>('POST', path, body),
  patch:  <T = Json>(path: string, body?: unknown) => request<T>('PATCH', path, body),
  put:    <T = Json>(path: string, body?: unknown) => request<T>('PUT', path, body),
  delete: <T = Json>(path: string, body?: unknown) => request<T>('DELETE', path, body),
}
