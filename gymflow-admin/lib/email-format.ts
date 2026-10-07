/**
 * The small formatting language the admin app's reply editor writes, and how it becomes an
 * email.
 *
 * The app edits plain text (a real rich-text editor needs a WebView), and its toolbar inserts
 * these markers around the selection:
 *
 *   **bold**   _italic_   ++underline++   [link text](https://example.com)
 *   a line starting with "- ", "* ", "• " or "✦ "   → bullet list
 *   a line starting with "1. "                       → numbered list
 *   a bare https:// address                           → clickable
 *
 * The same text is turned into HTML for the recipient and into clean plain text for the
 * text-only part and for the copy shown in the app. The input is always escaped first, so a
 * pasted `<script>` can only ever appear as text; only the markers above create markup.
 */

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const BULLET = /^\s*(?:[-*•✦])\s+(.*)$/
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.*)$/

/** A link is only ever http(s) or mailto; anything else (javascript:, data:) stays text. */
function safeUrl(raw: string): string | null {
  const url = raw.trim()
  return /^(https?:\/\/|mailto:)[^\s<>"]+$/i.test(url) ? url : null
}

/** Inline markers on one already-escaped line. */
function inlineHtml(escaped: string): string {
  return escaped
    // [text](url): the url was escaped too, and &amp; is what a valid href needs.
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, label: string, url: string) => {
      const href = safeUrl(url.replace(/&amp;/g, '&'))
      return href ? `<a href="${escapeHtml(href)}" style="color:#1D8CFF;text-decoration:none;">${label}</a>` : m
    })
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\+\+(.+?)\+\+/g, '<u>$1</u>')
    .replace(/(^|[^\w])_(.+?)_(?![\w])/g, '$1<em>$2</em>')
    // Bare addresses that are not already inside an href.
    // (Not after ">": that would be the text of a link written as [url](url).)
    .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, (_m, pre: string, url: string) =>
      `${pre}<a href="${url}" style="color:#1D8CFF;text-decoration:none;">${url}</a>`)
}

/** HTML for the body: paragraphs, line breaks and lists. No outer wrapper. */
export function markupToHtml(markup: string): string {
  const lines = markup.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  let para: string[] = []

  const flushPara = () => {
    if (para.length) out.push(`<p style="margin:0 0 14px;">${para.join('<br>')}</p>`)
    para = []
  }
  const closeList = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }

  for (const raw of lines) {
    const bullet = raw.match(BULLET)
    const numbered = !bullet ? raw.match(NUMBERED) : null
    if (bullet || numbered) {
      flushPara()
      const kind = bullet ? 'ul' : 'ol'
      if (list !== kind) {
        closeList()
        out.push(`<${kind} style="margin:0 0 14px;padding-left:22px;">`)
        list = kind
      }
      out.push(`<li style="margin:0 0 6px;">${inlineHtml(escapeHtml((bullet ?? numbered)![1]))}</li>`)
    } else if (raw.trim() === '') {
      closeList()
      flushPara()
    } else {
      closeList()
      para.push(inlineHtml(escapeHtml(raw)))
    }
  }
  closeList()
  flushPara()
  return out.join('\n')
}

/** The same text with the markers removed: what the plain-text part and the app show. */
export function markupToPlain(markup: string): string {
  return markup
    .replace(/\r\n/g, '\n')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_m, label: string, url: string) => (safeUrl(url) ? `${label} (${url})` : _m))
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\+\+(.+?)\+\+/g, '$1')
    .replace(/(^|[^\w])_(.+?)_(?![\w])/g, '$1$2')
    .replace(/^\s*[-*•]\s+/gm, '✦ ')
    .trim()
}
