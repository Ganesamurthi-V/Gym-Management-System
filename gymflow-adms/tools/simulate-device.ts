// Fake ADMS device: fetches options, polls getrequest, pushes ATTLOG batches, retries on failure.
// Usage: npm run simulate -- --url http://localhost:8081 --sn TEST123 --pins 1,2,3 [--gzip] [--kv]
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

const { values } = parseArgs({
  options: {
    url: { type: 'string', default: 'http://localhost:8081' },
    sn: { type: 'string', default: 'TEST123' },
    pins: { type: 'string', default: '1,2,3' },
    gzip: { type: 'boolean', default: false },
    kv: { type: 'boolean', default: false },
    poll: { type: 'string', default: '5' }, // seconds between getrequest polls
    interval: { type: 'string', default: '8' }, // seconds between new punches
    rounds: { type: 'string', default: '0' }, // stop after N punches have been confirmed; 0 = run forever
    'tz-minutes': { type: 'string', default: '330' },
    aspx: { type: 'boolean', default: false },
  },
})

const base = values.url!.replace(/\/$/, '')
const sn = values.sn!
const pins = values.pins!.split(',').map((p) => p.trim()).filter(Boolean)
const pollMs = Number(values.poll) * 1000
const intervalMs = Number(values.interval) * 1000
const maxRounds = Number(values.rounds)
const tz = Number(values['tz-minutes'])
const ext = values.aspx ? '.aspx' : ''

const pending: string[] = []
let confirmed = 0
let sending = false
const log = (m: string) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`)

const deviceTime = () => new Date(Date.now() + tz * 60_000).toISOString().slice(0, 19).replace('T', ' ')

function makeLine(): string {
  const pin = pins[Math.floor(Math.random() * pins.length)]!
  const time = deviceTime()
  return values.kv
    ? `pin=${pin}\ttime=${time}\tstatus=0\tverifytype=1`
    : `${pin}\t${time}\t0\t1\t0\t0\t0`
}

async function getOptions() {
  const res = await fetch(`${base}/iclock/cdata${ext}?SN=${sn}&options=all&pushver=2.4.1`)
  log(`GET cdata options -> ${res.status}\n${await res.text()}`)
}

async function poll() {
  try {
    const res = await fetch(`${base}/iclock/getrequest${ext}?SN=${sn}`)
    log(`GET getrequest -> ${res.status} ${(await res.text()).trim()}`)
  } catch (e) {
    log(`getrequest failed: ${(e as Error).message}`)
  }
}

async function flush() {
  if (sending || pending.length === 0) return
  sending = true
  const batch = pending.slice()
  try {
    const raw = Buffer.from(batch.join('\r\n') + '\r\n')
    const res = await fetch(`${base}/iclock/cdata${ext}?SN=${sn}&table=ATTLOG&Stamp=9999`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...(values.gzip ? { 'Content-Encoding': 'gzip' } : {}) },
      body: values.gzip ? gzipSync(raw) : raw,
    })
    const body = (await res.text()).trim()
    if (res.ok && body.startsWith('OK')) {
      pending.splice(0, batch.length)
      confirmed += batch.length
      log(`POST ATTLOG ${batch.length} line(s) -> ${res.status} ${body} (confirmed total ${confirmed})`)
    } else {
      log(`POST ATTLOG -> ${res.status} ${body}; keeping ${pending.length} unsent, will retry`)
    }
  } catch (e) {
    log(`POST ATTLOG failed (${(e as Error).message}); keeping ${pending.length} unsent, will retry`)
  } finally {
    sending = false
  }
}

async function main() {
  log(`simulating ${sn} against ${base}`)
  await getOptions()
  const pollTimer = setInterval(poll, pollMs)
  await poll()
  const tick = async () => {
    pending.push(makeLine())
    log(`punch recorded (${pending.length} unsent)`)
    await flush()
    if (maxRounds > 0 && confirmed >= maxRounds) {
      clearInterval(pollTimer)
      clearInterval(punchTimer)
      log('done')
    }
  }
  const punchTimer = setInterval(() => void tick(), intervalMs)
  void tick()
}

main().catch((e) => {
  console.error((e as Error).message)
  process.exit(1)
})
