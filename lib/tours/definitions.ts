/**
 * lib/tours/definitions.ts
 * ────────────────────────
 * Every chapter, step and line of copy for the owner console tour.
 *
 * Pure data — no `driver.js` import, not even a type-only one. `useOwnerTour`
 * translates these into Driver.js steps, which keeps the copy reviewable without
 * any knowledge of the tour library and lets the API route share the chapter ids.
 *
 * TWO CONSTRAINTS SHAPED ALL OF THIS
 * ----------------------------------
 * 1. A FIRST-RUN OWNER HAS AN EMPTY APP. They have just finished the setup
 *    wizard: no members, no payments, no dues, no inventory, no programs. Every
 *    table renders its empty state. So steps anchor to page headers, stat grids
 *    (which render `0`), action buttons, filter bars and tabs — never to table
 *    rows, row menus or bulk-action bars, which do not exist yet.
 *
 *    That is also an opportunity: the copy says what to DO, not just what is on
 *    screen.
 *
 * 2. THE TOUR SPANS NINE PAGES, SO IT WILL BE ABANDONED PARTWAY. Progress is
 *    saved per chapter and step and the tour resumes where it left off. A tour
 *    that restarts from step 1 is worse than no tour.
 *
 * WHY SOME PAGES ARE REPRESENTED BY A BUTTON INSTEAD OF A VISIT
 * ------------------------------------------------------------
 * Add Member, Import, Bulk Edit, New Product, Create Program and the attendance
 * log are all full-page forms. Walking the tour into a half-filled form is worse
 * than pointing at the button that opens it, so those features are introduced
 * where the owner will actually reach for them. `/owner/subscription` is
 * intentionally absent: it renders without the app shell, so there is nothing
 * stable to anchor to. Renewal is covered by the trial-banner step instead.
 */

import type { TourAnchorKey } from './anchors'
import type { TourChapterId } from './progress'

/**
 * Which viewports a step applies to.
 *
 * `desktop` exists because several controls are `hidden md:flex` — present in the
 * DOM but invisible below 768px. Driver.js's `skipMissingElement` only covers
 * elements absent from the DOM, so it would happily spotlight a 0×0 box. These
 * steps are filtered out by viewport instead.
 */
export type TourViewport = 'all' | 'desktop' | 'mobile'

export type TourStepSide = 'top' | 'right' | 'bottom' | 'left'
export type TourStepAlign = 'start' | 'center' | 'end'

export type TourStep = {
  /** Anchor to spotlight. Omit for a centred step with no target. */
  anchor?: TourAnchorKey
  title: string
  /** Supports inline HTML; `<strong>` is styled in `driver-theme.css`. */
  description: string
  side?: TourStepSide
  align?: TourStepAlign
  viewport?: TourViewport
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
  /** Shown above the title, e.g. "MEMBERS · 3 OF 10". */
  label: string
  /** Route this chapter's steps live on. The engine navigates when it differs. */
  route: string
  steps: TourStep[]
}

export const TOUR_CHAPTERS: TourChapter[] = [
  // ── 1. Welcome & orientation ──────────────────────────────────────────────
  {
    id: 'welcome',
    label: 'Welcome',
    route: '/owner/dashboard',
    steps: [
      {
        title: 'Welcome to GymFlow',
        description:
          'Your gym is set up. This quick tour shows you around — about two minutes, and you can leave whenever you like. You can always start it again later from your account menu.',
      },
      {
        anchor: 'sidebar',
        title: 'Your main menu',
        description:
          'Everything you manage lives here — members, payments, dues, attendance, stock and workout plans. We will walk through each one.',
        side: 'right',
        align: 'start',
        viewport: 'desktop',
      },
      {
        anchor: 'mobileNavToggle',
        title: 'Your main menu',
        description:
          'Tap here any time to move between members, payments, dues, attendance, stock and workout plans.',
        side: 'top',
        align: 'end',
        viewport: 'mobile',
      },
      {
        anchor: 'sidebarAddMember',
        title: 'Always one click away',
        description:
          'Adding a member is the thing you will do most, so it sits at the bottom of the menu on every page.',
        side: 'right',
        align: 'end',
        viewport: 'desktop',
      },
      {
        anchor: 'trialBanner',
        title: 'Your free trial',
        description:
          'This strip tracks how many days are left. You can upgrade from here at any point, and nothing you have entered is lost when the trial ends.',
        side: 'bottom',
        align: 'start',
        // Only rendered while the subscription is on trial, expiring or expired.
        // An owner on an active paid plan never sees it.
        optional: true,
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
          'Active members, today\'s check-ins, memberships about to expire, money collected today and what is still owed. They all read zero right now and fill in as you go. Each card opens the full list.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'dashExpiring',
        title: 'Renewals coming up',
        description:
          'Memberships ending this week or this month. This is the one panel worth checking every morning — catching a renewal before it lapses is far easier than winning the member back afterwards.',
        side: 'right',
        align: 'start',
      },
      {
        anchor: 'dashQuickActions',
        title: 'Everyday shortcuts',
        description:
          'The handful of things you will do most: add a member, mark attendance, open the attendance log and check dues.',
        side: 'left',
        align: 'start',
      },
      {
        anchor: 'dashReportBtn',
        title: 'Daily report',
        description:
          'Creates a PDF of the day\'s collections and new joiners — handy for your own records or for sharing with a partner.',
        side: 'left',
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
        anchor: 'membersAddBtn',
        title: 'Add a member',
        description:
          'Name, phone, plan and start date is all it takes. GymFlow works out the expiry date and gives each person a member ID automatically.',
        side: 'bottom',
        align: 'end',
      },
      {
        anchor: 'membersImport',
        title: 'Already keeping a list?',
        description:
          'Bring across an Excel or CSV file instead of retyping everyone. You get to review and fix the data before anything is saved.',
        side: 'bottom',
        align: 'center',
      },
      {
        anchor: 'membersStats',
        title: 'Membership health',
        description:
          'How many are active, how many have lapsed and how much is overdue — the fastest read on where your gym stands.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'membersSearch',
        title: 'Find anyone',
        description:
          'Search by name or phone on the left, or type a member ID on the right when someone is standing at your desk.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'membersFilterTabs',
        title: 'Filter by status',
        description:
          'Jump between everyone, active members, those expiring, those already expired, and anyone with money outstanding.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'membersAdvancedFilter',
        title: 'Narrow it down further',
        description:
          'Combine plan, joining date, gender and more when you need a specific group — for example everyone on a quarterly plan who is about to lapse.',
        side: 'bottom',
        align: 'end',
      },
      {
        anchor: 'membersBulkEdit',
        title: 'Change many at once',
        description:
          'Update plans, dates or fees for a whole group in one go, instead of opening each member in turn.',
        side: 'bottom',
        align: 'center',
        viewport: 'desktop',
      },
      {
        anchor: 'membersAttendanceLog',
        title: 'Who trained, and when',
        description:
          'The full check-in history, filterable by date range and member, and exportable whenever you need it.',
        side: 'bottom',
        align: 'center',
        viewport: 'desktop',
      },
      {
        anchor: 'membersExport',
        title: 'Your data stays yours',
        description:
          'Download your member list as a spreadsheet at any time. Nothing is locked in.',
        side: 'bottom',
        align: 'center',
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
        anchor: 'paymentsCollection',
        title: 'What you have collected',
        description:
          'The headline figure for the period you pick, split by cash, UPI and card, with membership fees, shop sales and recovered dues listed separately.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'paymentsPeriodFilter',
        title: 'Pick your period',
        description:
          'Today, this week, this month, all time, or a custom date range for a specific stretch.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'paymentsModeFilter',
        title: 'Filter by how they paid',
        description:
          'Narrow to cash, UPI or card — useful when you are reconciling your cash box or matching a bank statement.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'paymentsTabs',
        title: 'Three kinds of income',
        description:
          'Membership fees, shop and supplement sales, and dues you have recovered. Each tab keeps its own running count.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'paymentsSearch',
        title: 'Trace a payment',
        description:
          'Look up a transaction by member name, phone, member ID or product when someone queries a receipt.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'paymentsExport',
        title: 'Export for your accountant',
        description:
          'Download the transactions for the selected period as a spreadsheet, with the same filters applied.',
        side: 'bottom',
        align: 'end',
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
        anchor: 'duesTotal',
        title: 'Money still owed to you',
        description:
          'Everyone carrying a balance shows up here with the amount outstanding. Each row gets a WhatsApp reminder button and a collect button, so you can chase a payment and record it without leaving the page.',
        side: 'bottom',
        align: 'end',
        // The summary card is `hidden xs:flex`, so it is absent below 360px.
        optional: true,
      },
      {
        anchor: 'duesSearch',
        title: 'Find a specific balance',
        description:
          'Search by name or phone when a member asks what they owe. Part payments are fine — record what you actually received and the remaining balance updates itself.',
        side: 'bottom',
        align: 'start',
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
        anchor: 'attendanceInput',
        title: 'Check-ins',
        description:
          'A member types their ID and they are marked present. Leave this page open on a tablet at your entrance and members can check themselves in — no queue at your desk.',
        side: 'bottom',
        align: 'center',
      },
      {
        anchor: 'attendanceSession',
        title: 'Morning or evening',
        description:
          'Switch batches here, so you can see which session is actually busy and staff it properly.',
        side: 'left',
        align: 'start',
      },
      {
        anchor: 'attendanceTotal',
        title: 'Today\'s count',
        description:
          'A live total of everyone who has checked in today. The full history lives in the attendance log under Members.',
        side: 'top',
        align: 'center',
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
        anchor: 'inventoryHeader',
        title: 'Your shop',
        description:
          'Supplements, drinks and merchandise. Track what you hold, what it cost, what it sells for, and get a warning before you run out.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'inventoryAddBtn',
        title: 'Add a product',
        description:
          'Set up a product once with its price and opening stock. Sales are recorded against it and appear on the Payments page alongside your membership income.',
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
        anchor: 'programsCreateBtn',
        title: 'Build a workout plan',
        description:
          'Create a plan once — exercises, sets, reps, week by week — then assign it to as many members as you like. It shows up in their member app.',
        side: 'bottom',
        align: 'end',
      },
      {
        anchor: 'programsSearch',
        title: 'Find a plan',
        description:
          'Search your templates by name as your library grows.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'programsFilter',
        title: 'Drafts stay private',
        description:
          'Keep a plan as a draft while you are still working on it. Only published plans reach your members.',
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
        anchor: 'memberAppOverview',
        title: 'Your members get their own app',
        description:
          'They can see their membership, check in, follow their workout plan and track progress. These cards show how many have been invited and how many are actually using it.',
        side: 'bottom',
        align: 'start',
      },
      {
        anchor: 'memberAppTabs',
        title: 'Invite and keep track',
        description:
          'Send activation links over WhatsApp, watch which invitations have been opened, and tune the streaks and rewards that keep members coming back.',
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
        anchor: 'navReports',
        title: 'Reports are on the way',
        description:
          'Deeper reporting is being built. Until it lands, the Payments page and the daily PDF cover most of what owners ask for.',
        side: 'right',
        align: 'center',
        viewport: 'desktop',
      },
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

/** Total steps for a viewport — drives the "N of M" progress text. */
export function countTourSteps(isDesktop: boolean): number {
  return TOUR_CHAPTERS.reduce(
    (total, chapter) => total + chapter.steps.filter(step => isStepInViewport(step, isDesktop)).length,
    0,
  )
}

export function isStepInViewport(step: TourStep, isDesktop: boolean): boolean {
  const viewport = step.viewport ?? 'all'
  if (viewport === 'all') return true
  return viewport === (isDesktop ? 'desktop' : 'mobile')
}
