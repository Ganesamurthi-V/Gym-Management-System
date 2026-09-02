/**
 * lib/tours/definitions.ts
 * ────────────────────────
 * Every chapter, step and line of copy for the owner console tour.
 *
 * Pure data — no `driver.js` import, not even a type-only one. `useOwnerTour`
 * translates these into Driver.js steps, which keeps the copy reviewable without
 * any knowledge of the tour library and lets the API route share the chapter ids.
 *
 * ─── ONE MAIN IDEA PER PAGE ─────────────────────────────────────────────────
 * This tour deliberately does NOT walk through every control. Narrating each
 * button turns a two-minute orientation into a chore that owners abandon, and
 * most buttons explain themselves once you know what the page is for. So each
 * chapter introduces what the page is and the one thing the owner will reach for
 * most; related controls are mentioned inside that copy rather than getting their
 * own step.
 *
 * The anchor registry still carries entries for the finer controls. They are
 * attached in the markup and available if a step is ever added back, which is why
 * `npm run verify:tour` reports them as reserved rather than failing.
 *
 * ─── A FIRST-RUN OWNER HAS AN EMPTY APP ─────────────────────────────────────
 * They have just finished the setup wizard: no members, payments, dues, stock or
 * programs, so every table renders its empty state. Steps therefore anchor to
 * page headers, stat grids (which render `0`) and primary actions — never to
 * table rows, which do not exist yet. The copy says what to DO, not just what is
 * on screen.
 *
 * ─── ABANDONMENT IS EXPECTED ────────────────────────────────────────────────
 * Progress is saved per chapter and step, and the tour resumes where it left off.
 * A tour that restarts from step 1 is worse than no tour.
 */

import type { TourAnchorKey } from './anchors'
import type { TourChapterId } from './progress'

/**
 * Which viewports a step applies to.
 *
 * `desktop` / `mobile` exist because the navigation menu is a different element
 * on each: a persistent sidebar above 768px, a drawer below it. Driver.js's
 * `skipMissingElement` only covers elements absent from the DOM, and the sidebar
 * is `hidden md:flex` — present but invisible — so it would happily spotlight a
 * 0x0 box. These steps are filtered by viewport instead.
 */
export type TourViewport = 'all' | 'desktop' | 'mobile'

export type TourStepSide = 'top' | 'right' | 'bottom' | 'left'
export type TourStepAlign = 'start' | 'center' | 'end'

export type TourStep = {
  /** Anchor to spotlight. Omit for a centred step with no target. */
  anchor?: TourAnchorKey
  /**
   * Spotlight a NAVIGATION ITEM instead of a page element, to show the owner
   * where a page lives before opening it.
   *
   * The engine handles the rest of the behaviour implicitly:
   *   - opens the menu first (sidebar on desktop, drawer on mobile)
   *   - scopes the selector to whichever container that viewport shows, since
   *     both render the same `data-tour` value
   *   - does NOT navigate, because the point is to show the item from wherever
   *     the owner currently is; the following step performs the navigation
   *   - lets a click on the item advance the tour, so the natural instinct to
   *     click the highlighted menu entry does the right thing
   */
  navTarget?: TourAnchorKey
  title: string
  /** Supports inline HTML; `<strong>` is styled in `driver-theme.css`. */
  description: string
  side?: TourStepSide
  /**
   * Overrides `side` below 768px.
   *
   * Some panels change axis with the layout — the dashboard's Quick Actions is a
   * right-hand column on desktop but a two-column grid on a phone, where a
   * ~270px popover fits on neither side of a half-width button. Driver.js flips a
   * popover that does not fit, but with no good side available it ends up clamped
   * over the thing it is pointing at.
   */
  mobileSide?: TourStepSide
  align?: TourStepAlign
  viewport?: TourViewport
  /**
   * Open the navigation menu before showing this step, so the tour can explain a
   * menu that is actually open. The engine restores it automatically on the next
   * step that does not ask for it, and when the tour ends.
   */
  openNav?: boolean
  /**
   * The anchor may legitimately be absent, so skip the step instead of waiting
   * for it.
   *
   * The engine only applies this while already on the step's own route, where
   * absence is conclusive. Elements on a route we have not navigated to yet are
   * always waited for. That distinction matters: a blanket
   * `skipMissingElement` would make the owner sit through the full element
   * timeout before a genuinely absent step was skipped.
   */
  optional?: boolean
}

export type TourChapter = {
  id: TourChapterId
  /** Shown above the title, e.g. "MEMBERS". */
  label: string
  /** Route this chapter's steps live on. The engine navigates when it differs. */
  route: string
  steps: TourStep[]
}

export const TOUR_CHAPTERS: TourChapter[] = [
  // ── 1. Welcome, and the menu everything hangs off ─────────────────────────
  {
    id: 'welcome',
    label: 'Welcome',
    route: '/owner/dashboard',
    steps: [
      {
        title: 'Welcome to GymFlow',
        description:
          'Your gym is set up. This is a quick look around — about two minutes, and you can leave whenever you like. You can start it again any time from your account menu.',
      },
    ],
  },

  // ── 2. Dashboard ───────────────────────────────────────────────────────────
  {
    id: 'dashboard',
    label: 'Dashboard',
    route: '/owner/dashboard',
    steps: [
      {
        anchor: 'dashStats',
        title: 'Your gym at a glance',
        description:
          'Active members, today\'s check-ins, memberships about to expire, money collected today and what is still owed. They all read zero right now and fill in as you go. Each card opens the full list behind it.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'dashQuickActions',
        title: 'Your everyday shortcuts',
        description:
          'The five things you will do most, always one click away. Let us go through them.',
        side: 'left',
        mobileSide: 'top',
        align: 'start',
      },
      {
        anchor: 'dashAddMember',
        title: '1. Add New Member',
        description:
          'Sign someone up: name, phone, plan and start date. GymFlow works out the expiry date and gives them a member ID.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'center',
      },
      {
        anchor: 'dashMarkAttendance',
        title: '2. Mark Attendance',
        description:
          'Opens the check-in screen, where members mark themselves present with their member ID.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'center',
      },
      {
        anchor: 'dashAttendanceLog',
        title: '3. Attendance Log',
        description:
          'The full check-in history — who trained and when. Filter by date range or member, and export it whenever you need it.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'center',
      },
      {
        anchor: 'dashReportBtn',
        title: '4. Daily Report PDF',
        description:
          'Creates a PDF of today\'s collections and new joiners. Useful for your own records, or to share with a partner.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'center',
      },
      {
        anchor: 'dashViewDues',
        title: '5. View Fee Dues',
        description:
          'Jumps to everyone who still owes you money. When there is an outstanding amount, it shows right here on the button.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'center',
      },
    ],
  },

  // ── 3. Members ─────────────────────────────────────────────────────────────
  {
    id: 'members',
    label: 'Members',
    route: '/owner/members',
    steps: [
      {
        navTarget: 'navMembers',
        title: 'This is your main menu',
        description:
          'Every part of GymFlow is reachable from here. We will open each one in turn, starting with <strong>Members</strong>.',
      },
      {
        anchor: 'membersAddBtn',
        title: 'Everyone who trains at your gym',
        description:
          'Add a member with just their name, phone, plan and start date — GymFlow works out the expiry and assigns a member ID. Already keeping a list? Use <strong>Import</strong> to bring across an Excel or CSV file instead of retyping everyone.',
        side: 'bottom',
        align: 'end',
      },
    ],
  },

  // ── 4. Payments ────────────────────────────────────────────────────────────
  {
    id: 'payments',
    label: 'Payments',
    route: '/owner/payments',
    steps: [
      {
        navTarget: 'navPayments',
        title: 'Next: Payments',
        description: 'Everything you have taken in, in one place.',
      },
      {
        anchor: 'paymentsCollection',
        title: 'Everything you have collected',
        description:
          'Your income for whichever period you pick, split by cash, UPI and card. Membership fees, shop sales and recovered dues each get their own tab, and the whole view exports to a spreadsheet.',
        side: 'bottom',
        align: 'start',
      },
    ],
  },

  // ── 5. Dues ────────────────────────────────────────────────────────────────
  {
    id: 'dues',
    label: 'Fee Dues',
    route: '/owner/dues',
    steps: [
      {
        navTarget: 'navDues',
        title: 'Next: Fee Dues',
        description: 'Where you chase what is still outstanding.',
      },
      {
        anchor: 'duesTotal',
        title: 'Money still owed to you',
        description:
          'Everyone carrying a balance appears here. Each row has a WhatsApp reminder and a collect button, so you can chase a payment and record it without leaving the page. Part payments are fine — the balance updates itself.',
        side: 'bottom',
        align: 'end',
        // The summary card is `hidden xs:flex`, so it is absent below 360px.
        optional: true,
      },
    ],
  },

  // ── 6. Attendance ──────────────────────────────────────────────────────────
  {
    id: 'attendance',
    label: 'Attendance',
    route: '/owner/attendance',
    steps: [
      {
        navTarget: 'navAttendance',
        title: 'Next: Attendance',
        description: 'How members check in each day.',
      },
      {
        anchor: 'attendanceInput',
        title: 'Check-ins',
        description:
          'The member types their own ID here. Leave this page open on a tablet at your entrance and members check themselves in — no queue at your desk.',
        side: 'bottom',
        align: 'center',
      },
      {
        anchor: 'attendanceSubmit',
        title: 'Confirm the check-in',
        description:
          'Press Confirm and they are marked present for today. You will see their name and the time straight away, and on the way out the same ID records their check-out and workout duration.',
        side: 'top',
        align: 'center',
      },
      {
        anchor: 'attendanceSession',
        title: 'Morning or evening batch',
        description:
          'Switch the session before your batch starts, so check-ins are recorded against the right one. That way you can see which batch is actually busy and staff it properly.',
        side: 'left',
        mobileSide: 'bottom',
        align: 'start',
      },
    ],
  },

  // ── 7. Inventory ───────────────────────────────────────────────────────────
  {
    id: 'inventory',
    label: 'Inventory',
    route: '/owner/inventory',
    steps: [
      {
        navTarget: 'navInventory',
        title: 'Next: Inventory',
        description: 'Stock for anything you sell at the counter.',
      },
      {
        anchor: 'inventoryHeader',
        title: 'Your shop',
        description:
          'Supplements, drinks and merchandise. Track what you hold, what it cost and what it sells for. Sales recorded here show up alongside your membership income on the Payments page.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'inventoryAddBtn',
        title: 'Add a product',
        description:
          'Set a product up once with its price and opening stock, and GymFlow warns you before you run low. From then on you just record sales against it.',
        side: 'bottom',
        align: 'center',
      },
    ],
  },

  // ── 8. Programs ────────────────────────────────────────────────────────────
  {
    id: 'programs',
    label: 'Workout Programs',
    route: '/owner/programs',
    steps: [
      {
        navTarget: 'navPrograms',
        title: 'Next: Workout Programs',
        description: 'Training plans you can assign to members.',
      },
      {
        anchor: 'programsCreateBtn',
        title: 'Build workout plans',
        description:
          'Create a plan once — exercises, sets, reps, week by week — then assign it to as many members as you like and it appears in their app. Keep it as a draft while you are still working on it; only published plans reach members.',
        side: 'bottom',
        align: 'end',
      },
    ],
  },

  // ── 9. Member App ──────────────────────────────────────────────────────────
  {
    id: 'member-app',
    label: 'Member App',
    route: '/owner/member-app',
    steps: [
      {
        navTarget: 'navMemberApp',
        title: 'Last one: Member App',
        description: 'The app your members get on their own phones.',
      },
      {
        anchor: 'memberAppOverview',
        title: 'Your members get their own app',
        description:
          'They can see their membership, check in, follow their workout plan and track progress. Send activation links over WhatsApp, see who has actually started using it, and tune the streaks and rewards that keep them coming back.',
        side: 'bottom',
        align: 'start',
      },
    ],
  },

  // ── 10. Wrap up ────────────────────────────────────────────────────────────
  {
    id: 'wrap-up',
    label: 'Finishing up',
    route: '/owner/dashboard',
    steps: [
      {
        anchor: 'accountMenu',
        title: 'Settings and support',
        description:
          'Your gym details, password, UPI setup and our support inbox live in here — along with <strong>Take the tour again</strong> if you ever want a refresher.',
        side: 'bottom',
        align: 'end',
      },
      {
        title: 'That is the whole tour',
        description:
          'A good first move is adding a few members, or importing your existing list. Everything else follows from that. If you get stuck, Contact &amp; Support in your account menu reaches us directly.',
      },
    ],
  },
]

/**
 * Whether a step applies to the current viewport.
 *
 * The engine filters with this before building the Driver.js step list, so the
 * "N of M" progress text counts only the steps that viewport will actually show.
 */
export function isStepInViewport(step: TourStep, isDesktop: boolean): boolean {
  const viewport = step.viewport ?? 'all'
  if (viewport === 'all') return true
  return viewport === (isDesktop ? 'desktop' : 'mobile')
}
