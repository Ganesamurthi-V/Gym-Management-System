import { runOnce, STATE_KEY, type Env } from './run'
import type { State } from './state'

export default {
  async scheduled(_event: ScheduledController, env: Env, _ctx: ExecutionContext): Promise<void> {
    await runOnce(env, (input, init) => fetch(input, init), Date.now())
  },

  // Exposes nothing but liveness: 404 for everything except GET /health.
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    if (req.method !== 'GET' || url.pathname !== '/health') return new Response('Not found', { status: 404 })
    let last = 'unknown'
    try {
      const s = await env.STATE.get<State>(STATE_KEY, 'json')
      if (s?.lastRun) last = new Date(s.lastRun).toISOString()
    } catch {
      // keep "unknown"
    }
    return new Response(`ok\nlast run (refreshed hourly): ${last}\n`, { headers: { 'cache-control': 'no-store' } })
  },
}
