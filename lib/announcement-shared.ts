export type AnnouncementLevel = 'info' | 'warning' | 'critical'

export type Announcement = {
  message: string
  level: AnnouncementLevel
  link_url: string | null
  link_label: string | null
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
