import type { Punch } from './parser.js'

export const MAX_PUNCHES_PER_REQUEST = 500

export type Forwarder = (serial: string, punches: Punch[]) => Promise<{ known: boolean }>

export function createForwarder(opts: {
  url: string
  secret: string
  fetchImpl: typeof fetch
  timeoutMs: number
}): Forwarder {
  async function post(serial: string, punches: Punch[]): Promise<boolean> {
    // redirect:'error' so the bearer secret can never follow a redirect to another host.
    const res = await opts.fetchImpl(opts.url, {
      method: 'POST',
      redirect: 'error',
      headers: { Authorization: `Bearer ${opts.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ serial, punches }),
      signal: AbortSignal.timeout(opts.timeoutMs),
    })
    if (!res.ok) throw new Error(`app status ${res.status}`)
    const json = (await res.json()) as { success?: boolean; data?: { known?: boolean } }
    if (json?.success !== true) throw new Error('app rejected request')
    return json.data?.known === true
  }

  // Throws on any failure; callers must then answer 503 so the device keeps its buffer.
  return async (serial, punches) => {
    if (punches.length === 0) return { known: await post(serial, []) }
    let known = true
    for (let i = 0; i < punches.length; i += MAX_PUNCHES_PER_REQUEST) {
      known = (await post(serial, punches.slice(i, i + MAX_PUNCHES_PER_REQUEST))) && known
    }
    return { known }
  }
}
