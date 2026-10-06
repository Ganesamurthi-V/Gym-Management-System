/**
 * Pure helpers for turning raw inbound mail into inbox threads. Nothing here touches
 * the network or the database, so each rule can be checked on its own.
 */

/** "Ravi K <ravi@example.com>" -> { name: "Ravi K", email: "ravi@example.com" }. */
export function parseAddress(raw: string): { name: string | null; email: string } {
  const value = (raw ?? '').trim()
  const angled = value.match(/^(.*?)<([^<>]+)>\s*$/)
  if (angled) {
    const name = angled[1].trim().replace(/^"(.*)"$/, '$1').trim()
    return { name: name || null, email: angled[2].trim().toLowerCase() }
  }
  return { name: null, email: value.replace(/^<|>$/g, '').toLowerCase() }
}

/** "Re: Fwd: RE: hello" -> "hello". Gmail, Outlook and Apple Mail all stack these. */
export function normalizeSubject(subject: string | null | undefined): string {
  let s = (subject ?? '').trim()
  // Loop, because prefixes stack ("Re: Fwd: Re: ..."). Also strips "Re[2]:" and "AW:" forms.
  for (;;) {
    const next = s.replace(/^\s*(re|fwd?|aw|sv|vs)(\[\d+\])?\s*:\s*/i, '')
    if (next === s) break
    s = next
  }
  return s.trim() || '(no subject)'
}

/** Every <id@host> token in a header value, in order, with brackets kept. */
export function extractMessageIds(value: string | null | undefined): string[] {
  if (!value) return []
  return value.match(/<[^<>\s]+>/g) ?? []
}

/** Header lookup that ignores case, since mail systems disagree on "In-Reply-To". */
export function header(headers: Record<string, string> | null | undefined, name: string): string | null {
  if (!headers) return null
  const wanted = name.toLowerCase()
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === wanted) return headers[key]
  }
  return null
}

/**
 * Mail a person did not write: auto-replies, out-of-office, bounces and bulk. These are
 * stored with the thread but must not wake the admin's phone, and (per the inbox rules)
 * nothing is ever auto-sent in return, so two auto-responders cannot loop.
 */
export function isAutoMail(headers: Record<string, string> | null | undefined, from: string): boolean {
  const autoSubmitted = header(headers, 'auto-submitted')
  if (autoSubmitted && autoSubmitted.toLowerCase() !== 'no') return true
  const precedence = header(headers, 'precedence')?.toLowerCase()
  if (precedence && ['bulk', 'junk', 'list', 'auto_reply'].includes(precedence)) return true
  if (header(headers, 'x-autoreply') || header(headers, 'x-autorespond')) return true
  const sender = parseAddress(from).email
  return /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply)@/.test(sender)
}

export interface AuthResult {
  spf: string | null
  dkim: string | null
  dmarc: string | null
}

/**
 * Pulls spf/dkim/dmarc verdicts out of an Authentication-Results header, e.g.
 * "mx.example; spf=pass smtp.mailfrom=a.com; dkim=pass; dmarc=fail action=none".
 * Best effort: a header that is missing or oddly formatted gives nulls, not an error.
 */
export function parseAuthResults(headers: Record<string, string> | null | undefined): AuthResult {
  const value = header(headers, 'authentication-results') ?? header(headers, 'x-authentication-results') ?? ''
  const pick = (k: string) => value.match(new RegExp(`\\b${k}=([a-z]+)`, 'i'))?.[1]?.toLowerCase() ?? null
  return { spf: pick('spf'), dkim: pick('dkim'), dmarc: pick('dmarc') }
}

/** Plain text for a mail that only has HTML: tags out, entities decoded, blocks as lines. */
export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** A fresh RFC 5322 Message-ID for a reply we send, on our own domain. */
export function newMessageId(domain: string): string {
  return `<${crypto.randomUUID()}@${domain}>`
}
