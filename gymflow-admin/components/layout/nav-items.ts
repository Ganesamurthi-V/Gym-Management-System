import {
  LayoutDashboard, Building2, ScrollText, Bug,
  HeadphonesIcon, CreditCard, Megaphone, Cloud,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  title: string
  url: string
  icon: LucideIcon
}

export interface NavGroup {
  id: string
  label: string
  items: NavItem[]
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [{ title: 'Dashboard', url: '/dashboard', icon: LayoutDashboard }],
  },
  {
    id: 'gyms',
    label: 'Gyms',
    items: [
      { title: 'Gyms', url: '/gyms', icon: Building2 },
      { title: 'Subscriptions', url: '/subscriptions', icon: CreditCard },
    ],
  },
  {
    id: 'support',
    label: 'Support',
    items: [
      { title: 'Support', url: '/support', icon: HeadphonesIcon },
      { title: 'Announcements', url: '/announcements', icon: Megaphone },
    ],
  },
  {
    id: 'system',
    label: 'System',
    items: [
      { title: 'Errors', url: '/errors', icon: Bug },
      { title: 'Event Logs', url: '/logs', icon: ScrollText },
      { title: 'AWS Monitor', url: '/aws', icon: Cloud },
    ],
  },
]

export function isNavActive(pathname: string, url: string): boolean {
  return pathname === url || pathname.startsWith(url + '/')
}

export interface Crumb {
  label: string
  /** Omitted for the current page and for the group label, which has no page of its own. */
  href?: string
}

/** Header breadcrumbs: group > page > (detail). `detailLabel` is the real name of a gym / resource when the page supplies it. */
export function getBreadcrumbs(pathname: string, detailLabel?: string | null): Crumb[] {
  for (const group of NAV_GROUPS) {
    const item = group.items.find((i) => isNavActive(pathname, i.url))
    if (!item) continue
    const crumbs: Crumb[] = [{ label: group.label }]
    if (pathname === item.url) {
      crumbs.push({ label: item.title })
      return crumbs
    }
    crumbs.push({ label: item.title, href: item.url })
    const last = pathname.split('/').filter(Boolean).pop() ?? ''
    let decoded = last
    try { decoded = decodeURIComponent(last) } catch { /* keep the raw segment */ }
    crumbs.push({ label: detailLabel || decoded })
    return crumbs
  }
  return [{ label: 'GymFlow Admin' }]
}

/** Page title for the header: the nav item whose url prefixes the pathname (detail routes fall back to the parent). */
export function getPageTitle(pathname: string): string {
  const match = NAV_GROUPS.flatMap((g) => g.items).find((i) => isNavActive(pathname, i.url))
  return match?.title ?? 'GymFlow Admin'
}
