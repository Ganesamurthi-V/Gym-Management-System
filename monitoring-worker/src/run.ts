import { PROBES, CANARY_ENABLED, CANARY_MIN_INTERVAL_MS, MAX_SUBREQUESTS, RETRY_CUTOFF, MAX_INDIVIDUAL_ALERTS, LAST_RUN_REFRESH_MS, LONG_OPEN_MS, DIGEST_EVERY_MS } from './config'
import { runProbe, realSleep, type FetchFn, type SleepFn, type ProbeResult } from './probe'
import { decide, emptyState, revertUnsent, probesDiffer, type State } from './state'
import { sendTelegram, formatMessage, formatSummary, formatDigest } from './telegram'
import { runCanary } from './canary'

export interface Env {
  STATE: KVNamespace
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  HEALTH_CHECK_SECRET?: string
  BETTERSTACK_HEARTBEAT_URL?: string
  CANARY_EMAIL?: string
  CANARY_PASSWORD?: string
}

export const STATE_KEY = 'state'

export async function runOnce(
  env: Env,
  fetchFn: FetchFn,
  now: number,
  sleep: SleepFn = realSleep,
  canaryEnabled: boolean = CANARY_ENABLED,
  maxSubrequests: number = MAX_SUBREQUESTS,
): Promise<void> {
  // Every outbound fetch goes through `counted`. The heartbeat is reserved up front and uses the raw fetch.
  const heartbeat = Boolean(env.BETTERSTACK_HEARTBEAT_URL)
  let used = heartbeat ? 1 : 0
  const TELEGRAM_RESERVE = 1
  const counted: FetchFn = (url, init) => {
    // Hard cap: everything except the reserved Telegram summary stops before the budget is gone.
    if (used >= maxSubrequests - (url.startsWith('https://api.telegram.org/') ? 0 : TELEGRAM_RESERVE)) {
      return Promise.reject(new Error('subrequest budget'))
    }
    used++
    return fetchFn(url, init)
  }
  let prev: State = emptyState()
  let kvReadable = true
  try {
    const got = await env.STATE.get<State>(STATE_KEY, 'json')
    if (got !== null && (typeof got !== 'object' || typeof got.probes !== 'object' || got.probes === null)) {
      throw new Error('bad state')
    }
    prev = got ?? emptyState()
  } catch {
    kvReadable = false
    console.log('kv: read failed, continuing without previous state')
  }

  // Critical probes first (stable sort); lowest priority work is what gets skipped.
  const ordered = [...PROBES].sort((a, b) => Number(b.critical) - Number(a.critical))
  const room = Math.max(0, maxSubrequests - used - TELEGRAM_RESERVE)
  const toRun = ordered.slice(0, room)
  let skipped = ordered.length - toRun.length
  const results: ProbeResult[] = await Promise.all(
    toRun.map((p) => runProbe(p, env, counted, sleep, () => used < Math.min(RETRY_CUTOFF, maxSubrequests - TELEGRAM_RESERVE))),
  )

  let canaryRan = false
  if (canaryEnabled && now - (prev.canaryLast ?? 0) >= CANARY_MIN_INTERVAL_MS) {
    if (used + 3 + TELEGRAM_RESERVE <= maxSubrequests) {
      results.push(...(await runCanary(env, counted)).map((x) => (x.ok ? x : { ...x, kind: 'canary' as const, status: Number(/status (\d{3})/.exec(x.reason)?.[1]) || undefined })))
      canaryRan = true
    } else {
      skipped++
    }
  }

  const d = decide(prev, results, now)
  if (canaryRan) d.next.canaryLast = now

  // Skipped probes are absent from `results`, so decide() leaves their previous state untouched.
  // sent[i] tells whether message i reached Telegram; a message that did not is retried next run.
  const msgs = d.messages
  // "Still open" comes from stored state only: every probe that is currently alerted.
  const open = Object.entries(d.next.probes).filter(([, st]) => st.alerted).map(([name, st]) => ({ name, since: st.since }))
  let sent: boolean[] = msgs.map(() => false)
  if (!kvReadable) {
    // State unknown: every failure would look new and re-alert every run. One labelled summary at most, no reminders.
    const fresh = msgs.filter((m) => !m.reminder)
    if (fresh.length > 0 && used < maxSubrequests) {
      await sendTelegram(env, formatSummary(fresh, skipped, now, 'State storage (KV) is unavailable; alerts may repeat.'), counted)
    }
  } else if (msgs.length > MAX_INDIVIDUAL_ALERTS || (skipped > 0 && msgs.length > 0)) {
    if (used < maxSubrequests) {
      const ok = await sendTelegram(env, formatSummary(msgs, skipped, now, undefined, open), counted)
      sent = msgs.map(() => ok)
    }
  } else {
    sent = await Promise.all(
      msgs.map((m) => (used < maxSubrequests ? sendTelegram(env, formatMessage(m, now, open), counted) : Promise.resolve(false))),
    )
  }

  // 6-hourly digest, only while something has been down for 6 hours or more (one extra write per digest).
  if (kvReadable && now - (prev.digestAt ?? 0) >= DIGEST_EVERY_MS && used < maxSubrequests) {
    const long = Object.entries(d.next.probes)
      .filter(([, st]) => st.alerted && now - st.since >= LONG_OPEN_MS)
      .map(([name, st]) => ({ name, since: st.since, reason: st.reason }))
    if (long.length > 0 && (await sendTelegram(env, formatDigest(long, now), counted))) d.next.digestAt = now
  }

  if (kvReadable) {
    revertUnsent(prev, d.next, msgs.filter((_, i) => !sent[i]))
    const refresh = now - prev.lastRun >= LAST_RUN_REFRESH_MS
    if (probesDiffer(prev, d.next) || refresh) {
      d.next.lastRun = now
      try {
        await env.STATE.put(STATE_KEY, JSON.stringify(d.next))
      } catch {
        console.log('kv: write failed')
      }
    }
  }

  // Heartbeat only after a complete run, so Better Stack emails if this Worker stops.
  if (env.BETTERSTACK_HEARTBEAT_URL) {
    try {
      await fetchFn(env.BETTERSTACK_HEARTBEAT_URL, { signal: AbortSignal.timeout(3000) })
    } catch {
      console.log('heartbeat: failed')
    }
  }
}
