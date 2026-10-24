export type AnnouncementLevel = 'info' | 'warning' | 'critical'

export type Announcement = {
  message: string
  level: AnnouncementLevel
  link_url: string | null
  link_label: string | null
  /** Plain text shown after the link; '' when none (max 120 chars, enforced by the admin app). */
  message_after: string
  version: number
}

/**
 * The admin types the link, so it is untrusted: only a plain https URL may
 * become an href (blocks javascript:, data:, protocol-relative and relative).
 */
export function safeAnnouncementLink(url: unknown): string | null {
  if (typeof url !== 'string' || url.length === 0 || url.length > 300) return null
  try {
    return new URL(url).protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** Critical banners cannot be dismissed, so they ignore any stored dismissal. */
export function shouldShowAnnouncement(a: Announcement | null, dismissedVersion: number | null): boolean {
  if (!a || !a.message.trim()) return false
  if (a.level === 'critical') return true
  return dismissedVersion !== a.version
}

export type AnnouncementPart = { kind: 'text'; text: string } | { kind: 'link'; text: string; href: string }

/**
 * Ordered pieces of the single banner line: message, link (only when its URL is
 * safe), then message_after. Blank pieces are dropped; the renderer joins them
 * with spaces so the line wraps naturally.
 */
export function buildAnnouncementParts(a: Announcement): AnnouncementPart[] {
  const parts: AnnouncementPart[] = []
  const message = a.message?.trim()
  if (message) parts.push({ kind: 'text', text: message })
  const href = safeAnnouncementLink(a.link_url)
  if (href) parts.push({ kind: 'link', text: a.link_label?.trim() || 'Learn more', href })
  const after = a.message_after?.trim()
  if (after) parts.push({ kind: 'text', text: after })
  return parts
}
