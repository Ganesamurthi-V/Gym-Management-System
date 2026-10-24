// Pure validation for the site-wide announcement. Kept free of framework imports so it can be
// checked in isolation. Owners render the message as plain text, so we strip control characters
// rather than try to escape HTML.
export const ANNOUNCEMENT_LEVELS = ['info', 'warning', 'critical'] as const
export type AnnouncementLevel = (typeof ANNOUNCEMENT_LEVELS)[number]

export const MESSAGE_MAX = 200
export const LINK_URL_MAX = 300
export const LINK_LABEL_MAX = 30
export const MESSAGE_AFTER_MAX = 120

export type AnnouncementInput = {
  message: string // may be '' only when is_active is false (caller keeps the stored message)
  level: AnnouncementLevel
  link_url: string | null
  link_label: string | null
  message_after: string // shown after the link on the same line; '' when unused
  is_active: boolean
}

// Built from char codes (not a literal) so no raw control or line-separator character lives in the source.
const CONTROL_CHARS = new RegExp('[\u0000-\u001F\u007F-\u009F\u2028\u2029]', 'g')

function clean(v: string): string {
  return v.replace(CONTROL_CHARS, ' ').replace(/\s+/g, ' ').trim()
}

export function validateAnnouncement(raw: unknown): AnnouncementInput | { error: string } {
  if (!raw || typeof raw !== 'object') return { error: 'Invalid request' }
  const b = raw as Record<string, unknown>

  if (typeof b.is_active !== 'boolean') return { error: 'is_active must be true or false' }
  if (typeof b.level !== 'string' || !(ANNOUNCEMENT_LEVELS as readonly string[]).includes(b.level)) {
    return { error: 'level must be info, warning or critical' }
  }
  if (b.message !== undefined && typeof b.message !== 'string') return { error: 'message must be text' }

  const message = clean(typeof b.message === 'string' ? b.message : '')
  if (message.length > MESSAGE_MAX) return { error: `Message must be at most ${MESSAGE_MAX} characters` }
  if (b.is_active && message.length === 0) return { error: 'Message is required to publish' }

  let link_url: string | null = null
  if (b.link_url != null) {
    if (typeof b.link_url !== 'string') return { error: 'link_url must be text' }
    const u = b.link_url.trim()
    if (u) {
      if (u.length > LINK_URL_MAX) return { error: `Link must be at most ${LINK_URL_MAX} characters` }
      let parsed: URL
      try { parsed = new URL(u) } catch { return { error: 'Link must be a valid https:// URL' } }
      if (parsed.protocol !== 'https:') return { error: 'Link must start with https://' }
      link_url = u
    }
  }

  let link_label: string | null = null
  if (b.link_label != null) {
    if (typeof b.link_label !== 'string') return { error: 'link_label must be text' }
    const l = clean(b.link_label)
    if (l.length > LINK_LABEL_MAX) return { error: `Link label must be at most ${LINK_LABEL_MAX} characters` }
    // A label without a link has nothing to attach to.
    link_label = l && link_url ? l : null
  }

  let message_after = ''
  if (b.message_after != null) {
    if (typeof b.message_after !== 'string') return { error: 'message_after must be text' }
    message_after = clean(b.message_after)
    if (message_after.length > MESSAGE_AFTER_MAX) return { error: `Text after the link must be at most ${MESSAGE_AFTER_MAX} characters` }
  }

  return { message, level: b.level as AnnouncementLevel, link_url, link_label, message_after, is_active: b.is_active }
}
