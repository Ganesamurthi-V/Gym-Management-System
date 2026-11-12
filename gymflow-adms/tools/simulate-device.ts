// Fake ADMS device: fetches options, polls getrequest, pushes ATTLOG batches, applies server commands, retries on failure.
// Usage: npm run simulate -- --url http://localhost:8081 --sn TEST123 --pins 1,2,3 [--gzip] [--kv]
//   [--users 1,2,3] [--dialect privilege|pri] [--fail-commands] [--pushcommkey KEY] [--delay SECONDS]
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

export type Dialect = 'privilege' | 'pri'
export type User = { name: string; privilege: string }
export type Command = { id: string; command: string }
export type CommandResult = { id: string; ret: number; cmd: string }

// getrequest body: "OK" or lines "C:<id>:<command>" separated by LF or CRLF. Anything else is ignored.
export function parseCommandLines(text: string): Command[] {
  const out: Command[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = /^C:([^:]+):(.+)$/.exec(raw.trim())
    if (m) out.push({ id: m[1]!, command: m[2]!.trim() })
  }
  return out
}

function fields(s: string): Record<string, string> {
  const o: Record<string, string> = {}
  for (const part of s.split('	')) {
    const i = part.indexOf('=')
    if (i > 0) o[part.slice(0, i).trim()] = part.slice(i + 1)
  }
  return o
}

// Applies one command to the user table. Return 0 = ok, -1002 = unknown command or wrong dialect.
export function applyCommand(users: Map<string, User>, cmd: Command, dialect: Dialect = 'privilege'): CommandResult {
  const text = cmd.command
  const ack = (ret: number): CommandResult => ({ id: cmd.id, ret, cmd: text.split(/\s+/).slice(0, 2).join(' ') })
  const upd = /^DATA UPDATE USERINFO\s+(.*)$/s.exec(text)
  if (upd) {
    const f = fields(upd[1]!)
    const other = dialect === 'privilege' ? 'Pri' : 'Privilege'
    if (!f.PIN || other in f) return ack(-1002)
    const priv = f[dialect === 'privilege' ? 'Privilege' : 'Pri']
    users.set(f.PIN, { name: f.Name ?? users.get(f.PIN)?.name ?? '', privilege: priv ?? users.get(f.PIN)?.privilege ?? '0' })
    return ack(0)
  }
  const del = /^DATA DELETE USERINFO\s+(.*)$/s.exec(text)
  if (del) {
    const pin = fields(del[1]!).PIN
    if (!pin) return ack(-1002)
    users.delete(pin)
    return ack(0)
  }
  return ack(-1002)
}

// Body of POST /iclock/devicecmd: one line per command.
export const devicecmdBody = (results: CommandResult[]) =>
  results.map((r) => `ID=${r.id}&Return=${r.ret}&CMD=${r.cmd}`).join('\r\n') + '\r\n'

async function run() {
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
    users: { type: 'string', default: '' }, // seed the device user table
    dialect: { type: 'string', default: 'privilege' }, // field name the device accepts: Privilege or Pri
    'fail-commands': { type: 'boolean', default: false }, // answer every command with -1002
    pushcommkey: { type: 'string' }, // extra query parameter on every request
    delay: { type: 'string' }, // overrides --poll
  },
})

const base = values.url!.replace(/\/$/, '')
const sn = values.sn!
const pins = values.pins!.split(',').map((p) => p.trim()).filter(Boolean)
const pollMs = Number(values.delay ?? values.poll) * 1000
if (values.dialect !== 'privilege' && values.dialect !== 'pri') throw new Error('--dialect must be privilege or pri')
const dialect: Dialect = values.dialect
const userTable = new Map<string, User>()
for (const p of values.users!.split(',').map((x) => x.trim()).filter(Boolean)) userTable.set(p, { name: `User ${p}`, privilege: '0' })
const extra = values.pushcommkey ? `&pushcommkey=${encodeURIComponent(values.pushcommkey)}` : ''
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
  const res = await fetch(`${base}/iclock/cdata${ext}?SN=${sn}&options=all&pushver=2.4.1${extra}`)
  log(`GET cdata options -> ${res.status}\n${await res.text()}`)
}

async function poll() {
  try {
    const res = await fetch(`${base}/iclock/getrequest${ext}?SN=${sn}${extra}`)
    const body = (await res.text()).trim()
    log(`GET getrequest -> ${res.status} ${body}`)
    const cmds = parseCommandLines(body)
    if (cmds.length > 0) await handleCommands(cmds)
  } catch (e) {
    log(`getrequest failed: ${(e as Error).message}`)
  }
}

async function handleCommands(cmds: Command[]) {
  const results = cmds.map((c) => {
    const r = values['fail-commands'] ? { id: c.id, ret: -1002, cmd: c.command.split(/\s+/).slice(0, 2).join(' ') } : applyCommand(userTable, c, dialect)
    log(`command ${c.id}: ${c.command.replace(/	/g, ' | ')} -> Return=${r.ret}`)
    return r
  })
  try {
    const res = await fetch(`${base}/iclock/devicecmd${ext}?SN=${sn}${extra}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: devicecmdBody(results),
    })
    log(`POST devicecmd ${results.length} ack(s) -> ${res.status} ${(await res.text()).trim()}`)
  } catch (e) {
    log(`devicecmd failed: ${(e as Error).message}`)
  }
  log(`user table (${userTable.size}): ${[...userTable].map(([p, u]) => `${p}=${u.name}/${u.privilege}`).join(', ') || 'empty'}`)
}

async function flush() {
  if (sending || pending.length === 0) return
  sending = true
  const batch = pending.slice()
  try {
    const raw = Buffer.from(batch.join('\r\n') + '\r\n')
    const res = await fetch(`${base}/iclock/cdata${ext}?SN=${sn}&table=ATTLOG&Stamp=9999${extra}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...(values.gzip ? { 'Content-Encoding': 'gzip' } : {}) },
      body: values.gzip ? gzipSync(raw) : raw,
    })
    const body = (await res.text()).trim()
    if (res.ok && /^OK:?/.test(body)) {
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
}

// Only run when executed directly, so tests can import the helpers.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) void run()
