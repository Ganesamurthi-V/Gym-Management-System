// Public front door for biometric devices (bio.gymflow.sbs). Cloudflare answers on port 80 and 443, so old
// devices that only speak plain HTTP and new ones that speak HTTPS both work, and the real receiver address
// stays private: it lives only in the ORIGIN_URL secret, never in the repo or in anything a device can see.
// Only the paths a device needs are forwarded; everything else is a bare 404.

const ALLOWED = /^\/(iclock\/[A-Za-z0-9_.\-/]*|healthz)$/

export default {
  // Cron keep-alive (see wrangler.jsonc). A free instabox box pauses after 30 idle minutes; a public request
  // counts as activity and wakes it, so ping the receiver's health route every 25 minutes. It cannot beat the
  // box's fixed 480-minute max-run cap, only the idle pause.
  async scheduled(_event, env) {
    if (!env.ORIGIN_URL) return
    try {
      const res = await fetch(new URL('/healthz', env.ORIGIN_URL), { signal: AbortSignal.timeout(50_000) })
      console.log('keepalive', res.status)
    } catch {
      console.log('keepalive failed')
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url)
    if (!ALLOWED.test(url.pathname) || !env.ORIGIN_URL) {
      return new Response(null, { status: 404 })
    }

    const target = new URL(url.pathname + url.search, env.ORIGIN_URL)
    // Pass through only what the ADMS protocol uses; drop cookies and anything that could identify this proxy.
    const headers = new Headers()
    for (const name of ['content-type', 'content-encoding', 'content-length', 'user-agent']) {
      const v = request.headers.get(name)
      if (v) headers.set(name, v)
    }
    // The receiver rate-limits per client, so hand it the real device IP.
    const ip = request.headers.get('cf-connecting-ip')
    if (ip) headers.set('x-forwarded-for', ip)

    try {
      const res = await fetch(target, {
        method: request.method,
        headers,
        body: request.method === 'GET' || request.method === 'HEAD' ? undefined : request.body,
        signal: AbortSignal.timeout(50_000), // a paused origin can take up to ~45 s to wake
      })
      // 5xx must reach the device as-is so it keeps the punches and retries later.
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') ?? 'text/plain' },
      })
    } catch {
      return new Response('ERROR', { status: 503, headers: { 'retry-after': '60' } })
    }
  },
}
