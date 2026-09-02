/**
 * lib/tours/anchors.ts
 * ────────────────────
 * Single source of truth for the `data-tour` hooks the guided tour targets.
 *
 * WHY `data-tour` AND NOT IDs / CLASSES
 * ------------------------------------
 * The owner console styles everything with Tailwind utility classes, which churn
 * whenever the design is touched, and almost nothing in `components/layout/` has
 * a stable `id`. Adding a dedicated attribute is:
 *   - additive     — it cannot change layout, styling or behaviour,
 *   - greppable    — `data-tour="members-add-btn"` finds the anchor instantly,
 *   - stable       — immune to class reshuffling during redesigns.
 *
 * Lookups go through `at()` / `tourAttr()` so a renamed anchor is a TypeScript
 * error rather than a step that silently points at nothing.
 *
 * IMPORTANT: anchors must only be attached to elements that exist for a brand
 * new gym with ZERO data. A first-run owner has no members, payments, dues,
 * inventory or programs, so every table renders an empty state. Anchor page
 * headers, stat grids (they render `0`), action buttons, filter bars and tabs —
 * never table rows, row menus or bulk-action bars.
 */

export const TOUR_ANCHORS = {
  // ── Shell ──────────────────────────────────────────────────────────────────
  sidebar: 'shell-sidebar',
  sidebarAddMember: 'shell-sidebar-add-member',
  accountMenu: 'shell-account-menu',
  trialBanner: 'shell-trial-banner',
  mobileNavToggle: 'shell-mobile-nav-toggle',
  /**
   * The nav list inside the mobile drawer.
   *
   * Needed as its own anchor because the desktop sidebar's nav items carry the
   * same `data-tour` values and appear earlier in the DOM. On a phone the sidebar
   * is `hidden md:flex`, so `querySelector` would return that hidden element and
   * Driver.js would spotlight a 0x0 box. Only exists while the drawer is open.
   */
  mobileNavPanel: 'shell-mobile-nav-panel',

  // ── Navigation (rendered from NAV_ITEMS, desktop + mobile drawer) ──────────
  navDashboard: 'nav-dashboard',
  navMembers: 'nav-members',
  navPayments: 'nav-payments',
  navDues: 'nav-dues',
  navAttendance: 'nav-attendance',
  navInventory: 'nav-inventory',
  navPrograms: 'nav-programs',
  navReports: 'nav-reports',
  navMemberApp: 'nav-member-app',

  // ── Dashboard ──────────────────────────────────────────────────────────────
  dashStats: 'dash-stats',
  dashExpiring: 'dash-expiring',
  dashQuickActions: 'dash-quick-actions',
  dashReportBtn: 'dash-report-btn',

  // ── Members ────────────────────────────────────────────────────────────────
  membersStats: 'members-stats',
  membersAdvancedFilter: 'members-advanced-filter',
  membersExport: 'members-export',
  membersImport: 'members-import',
  membersBulkEdit: 'members-bulk-edit',
  membersAttendanceLog: 'members-attendance-log',
  membersAddBtn: 'members-add-btn',
  membersSearch: 'members-search',
  membersFilterTabs: 'members-filter-tabs',

  // ── Payments ───────────────────────────────────────────────────────────────
  paymentsCollection: 'payments-collection',
  paymentsPeriodFilter: 'payments-period-filter',
  paymentsModeFilter: 'payments-mode-filter',
  paymentsTabs: 'payments-tabs',
  paymentsSearch: 'payments-search',
  paymentsExport: 'payments-export',

  // ── Dues ───────────────────────────────────────────────────────────────────
  duesTotal: 'dues-total',
  duesSearch: 'dues-search',

  // ── Attendance (self-service kiosk) ───────────────────────────────────────
  attendanceSession: 'attendance-session',
  attendanceInput: 'attendance-input',
  attendanceTotal: 'attendance-total',

  // ── Inventory ──────────────────────────────────────────────────────────────
  inventoryHeader: 'inventory-header',
  inventoryAddBtn: 'inventory-add-btn',

  // ── Programs ───────────────────────────────────────────────────────────────
  programsCreateBtn: 'programs-create-btn',
  programsSearch: 'programs-search',
  programsFilter: 'programs-filter',

  // ── Member App ─────────────────────────────────────────────────────────────
  memberAppOverview: 'member-app-overview',
  memberAppTabs: 'member-app-tabs',
} as const

export type TourAnchorKey = keyof typeof TOUR_ANCHORS

/** CSS selector for a step's `element`. */
export function at(key: TourAnchorKey): string {
  return `[data-tour="${TOUR_ANCHORS[key]}"]`
}

/**
 * Spreadable JSX prop, e.g. `<button {...tourAttr('membersAddBtn')}>`.
 *
 * Returning an object keeps the call sites a single additive expression, so
 * attaching an anchor never reformats or restructures existing markup.
 */
export function tourAttr(key: TourAnchorKey): { 'data-tour': string } {
  return { 'data-tour': TOUR_ANCHORS[key] }
}

/**
 * Nav anchors are keyed by label so `NAV_ITEMS` needs one edit to cover both the
 * desktop sidebar and the mobile drawer, which render the same list.
 *
 * Keyed by label rather than href because the "Reports" entry is `comingSoon`
 * with `href: '#'`, so routes are not unique across the list.
 */
export const NAV_ANCHOR_BY_LABEL: Record<string, TourAnchorKey> = {
  Dashboard: 'navDashboard',
  Members: 'navMembers',
  Payments: 'navPayments',
  Dues: 'navDues',
  Attendance: 'navAttendance',
  Inventory: 'navInventory',
  Programs: 'navPrograms',
  Reports: 'navReports',
  'Member App': 'navMemberApp',
}

/** `data-tour` for a nav item, or `{}` for entries with no anchor. */
export function navTourAttr(label: string): { 'data-tour'?: string } {
  const key = NAV_ANCHOR_BY_LABEL[label]
  return key ? { 'data-tour': TOUR_ANCHORS[key] } : {}
}
