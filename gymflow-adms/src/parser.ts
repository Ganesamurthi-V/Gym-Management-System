export interface Punch {
  pin: string
  time: string
  status: number | null
  verify: number | null
}

export interface ParseResult {
  punches: Punch[]
  skipped: number
}

const PIN_RE = /^[A-Za-z0-9]{1,32}$/
const TIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/
// Longer lines are never real punches; skipping them keeps the regexes below away from huge inputs.
const MAX_LINE = 512
const KV_RE = /(\w+)=(.*?)(?=\s+\w+=|$)/g

function toInt(v: string | undefined): number | null {
  if (v === undefined || !/^-?\d{1,6}$/.test(v.trim())) return null
  return Number(v.trim())
}

// Some firmware sends the time as Unix seconds (10 digits, UTC). The app wants device-local wall time, so shift it
// by the device's offset (unverified on real hardware: which firmware sends epochs).
function epochToLocal(sec: string, offsetMinutes: number): string {
  return new Date((Number(sec) + offsetMinutes * 60) * 1000).toISOString().slice(0, 19).replace('T', ' ')
}

function build(
  offset: number,
  pin: string | undefined,
  time: string | undefined,
  status?: string,
  verify?: string,
): Punch | null {
  const p = pin?.trim()
  let t = time?.trim().replace('T', ' ')
  if (t && /^\d{10}$/.test(t)) t = epochToLocal(t, offset)
  if (!p || !PIN_RE.test(p) || !t || !TIME_RE.test(t)) return null
  return { pin: p, time: t, status: toInt(status), verify: toInt(verify) }
}

function parseLine(line: string, off: number): Punch | null {
  // key=value dialect (rtlog / push 3.x): pin=1\ttime=2026-11-09 08:01:02\tstatus=0\tverifytype=1
  if (/^\s*\w+=/.test(line)) {
    const kv: Record<string, string> = {}
    for (const m of line.matchAll(KV_RE)) kv[m[1]!.toLowerCase()] = m[2]!.trim()
    return build(
      off,
      kv.pin ?? kv.userid ?? kv.badgenumber,
      kv.time ?? kv.datetime ?? kv.checktime,
      kv.status ?? kv.checktype,
      kv.verifytype ?? kv.verified ?? kv.verifymode ?? kv.verify,
    )
  }
  // Classic: PIN \t YYYY-MM-DD HH:MM:SS \t status \t verify \t workcode ...
  const f = line.split('\t')
  if (f.length >= 2) return build(off, f[0], f[1], f[2], f[3])
  // Fallback: whitespace separated, date and time arrive as two tokens.
  const w = line.trim().split(/\s+/)
  return build(off, w[0], w[1] && w[2] ? `${w[1]} ${w[2]}` : undefined, w[3], w[4])
}

export function parseAttlog(body: string, opts: { epochOffsetMinutes?: number } = {}): ParseResult {
  const off = opts.epochOffsetMinutes ?? 330
  const punches: Punch[] = []
  let skipped = 0
  for (const raw of body.split(/\r?\n/)) {
    if (raw.length > MAX_LINE) {
      skipped++
      continue
    }
    if (!raw.trim()) continue
    const punch = parseLine(raw, off)
    if (punch) punches.push(punch)
    else skipped++
  }
  return { punches, skipped }
}
