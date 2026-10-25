/* Single source of truth for the feature pages (/features and the pages under it), /pricing and the guides.

   Three consumers read this file and must not drift apart: the React pages (src/pages), the
   Vite plugin in vite.config.ts that writes each page's <head>, JSON-LD and no-JavaScript copy
   into the HTML, and the footer/navbar links. Pure data on purpose, with no JSX and no React
   imports, because vite.config.ts imports it before any of the app's tooling exists.

   The wording was checked against the real product. Treat it as verified: change a claim here
   only after checking it against the app, and never add customer numbers, testimonials or
   prices that are not in src/data/plans.ts.

   Tutorial video and real screenshots (every page except the hub):
     1. Drop files in public/features/<slug>/ (tutorial.mp4, tutorial-poster.webp, shot-1.webp, ...).
     2. Tutorial: set `src` to '/features/<slug>/tutorial.mp4' and set width/height to the
        recording's real pixel size (a portrait phone recording is e.g. 720 x 1280).
     3. Screenshots: add { src, alt, width, height, caption? } entries to `screenshots`.
     4. An empty `src` / empty `screenshots` means "not added yet": a dashed placeholder shows in
        `npm run dev` only, and the production build renders and emits nothing for that slot.
   Files must live under public/ (self-hosted): the CSP in public/_headers allows media from 'self' only.

   Inline markup inside any string: **bold** and [link text](href). Nothing else. parseInline()
   below is the one parser, used by the React renderer and by the no-JavaScript copy alike. */

import { PLANS, formatINR, perMonth, savingPercent } from './plans.ts'

export const SITE_ORIGIN = 'https://www.gymflow.sbs'

// The two billing tiers, read from plans.ts so a price is never typed twice.
const MONTHLY = PLANS[0]
const YEARLY = PLANS[1]

export type FeatureIcon = 'users' | 'rupee' | 'calendar-check' | 'smartphone' | 'message' | 'chart' | 'upload' | 'dumbbell' | 'tag' | 'book'

export type FeatureBlock =
  | { type: 'p'; text: string }
  | { type: 'h3'; text: string }
  | { type: 'note'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  /** The hub only: the grid of one card per feature page. */
  | { type: 'features' }

export interface FeatureSection {
  heading: string
  blocks: FeatureBlock[]
}

export interface FeatureTutorial {
  /** Site path of the video, e.g. '/features/whatsapp/tutorial.mp4'. '' = not added yet. */
  src: string
  /** Thumbnail shown before play, and the VideoObject thumbnailUrl. */
  poster: string
  /** The recording's real pixel size; sets the aspect ratio so the page does not shift on load. */
  width: number
  height: number
  title: string
  /** Falls back to the title when empty. */
  description: string
  /** ISO date; falls back to FEATURE_DATE_MODIFIED when empty. */
  uploadDate: string
  /** ISO 8601, e.g. 'PT1M20S'. Optional. */
  duration?: string
}

export interface FeatureScreenshot {
  src: string
  alt: string
  width: number
  height: number
  caption?: string
}

/** An empty tutorial slot with the folder convention filled in; the owner sets src and sizes. */
const tutorialSlot = (slug: string, title: string): FeatureTutorial => ({
  src: '',
  poster: `/features/${slug}/tutorial-poster.webp`,
  width: 1280,
  height: 720,
  title,
  description: '',
  uploadDate: '',
})

export interface FeaturePage {
  slug: string
  /** <title>, also the WebPage name and the og:title. */
  title: string
  /** Meta description, also the og:description. */
  description: string
  h1: string
  eyebrow: string
  intro: string
  /** Last item of the visible breadcrumb and of the BreadcrumbList. */
  breadcrumb: string
  /** How this page is listed on the hub and in "Related features". Absent on the hub itself. */
  cardTitle?: string
  cardText?: string
  icon?: FeatureIcon
  related: string[]
  /** Sidebar heading shown above this page; later pages share it until the next one. Absent = the feature list. */
  group?: string
  /** True for pages that sit directly under Home (/pricing, the guides), not under Features. */
  topLevel?: boolean
  /** Social preview card, 1200x630, under public/og/. Absent = the generic homepage card. */
  ogImage?: string
  ogAlt?: string
  /** Absent on the hub. See the note at the top of this file. */
  tutorial?: FeatureTutorial
  screenshots?: FeatureScreenshot[]
  sections: FeatureSection[]
}

/** The link under the related grid, shared by every feature page. */
export const FEATURE_OUTRO = '[See all GymFlow features](/features) or go back to the [home page](/).'

/** Heading of the related-features grid on every feature page. */
export const RELATED_HEADING = 'Related features'

/** The line under the hero buttons, as the pages have always said it. */
export const FEATURE_FINEPRINT = '14-day free trial. No credit card needed.'

/** Matches the homepage's dateModified; bump it when a page's copy changes. */
export const FEATURE_DATE_MODIFIED = '2026-10-24'

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: 'features',
    ogImage: '/og/features.jpg',
    ogAlt: 'GymFlow features: member management, fees, attendance, member app, WhatsApp reminders and reports for gyms in India.',
    title: 'Gym Management Software Features for India — GymFlow',
    description: 'Every GymFlow feature in one list: member management, fees and dues, attendance, member app, WhatsApp reminders, reports and Excel import. All in every plan.',
    h1: 'Gym management software features',
    eyebrow: 'Features',
    intro: 'GymFlow brings the everyday work of an independent gym into one place: members, fees, attendance, a member app, WhatsApp reminders and reports. Each part is described below, in plain language, with what it does and how it works.',
    breadcrumb: 'Features',
    related: [],
    sections: [
      {
        heading: 'What GymFlow does',
        blocks: [
          { type: 'features' },
        ],
      },
      {
        heading: 'Every feature is in every plan',
        blocks: [
          { type: 'p', text: 'GymFlow has no add-on modules and no features held back for a higher plan. Whichever plan you choose, you get everything on this page. Members and WhatsApp messages are unlimited, and you can try all of it free for 14 days without a credit card. [See pricing](/pricing).' },
        ],
      },
      {
        heading: 'Pricing and guides',
        blocks: [
          {
            type: 'ul',
            items: [
              '[Pricing](/pricing): two plans with every feature in both, and a 14-day free trial.',
              '[Gym software vs Excel](/gym-software-vs-excel): when a register or spreadsheet is enough and when it is not.',
            ],
          },
        ],
      },
      {
        heading: 'How the parts fit together',
        blocks: [
          {
            type: 'ol',
            items: [
              'You add a member, or [import your whole list](/import-export). They get a welcome message on WhatsApp.',
              'You record what they paid, and what they still owe. GymFlow reminds them until they pay.',
              'They check in at your front desk and build a streak in their own app.',
              'Reports show you who is growing, who owes, who is about to leave and who has stopped coming.',
            ],
          },
        ],
      },
      {
        heading: 'Built for independent gyms in India',
        blocks: [
          { type: 'p', text: 'GymFlow is made for owner-run gyms and fitness studios across India. It works in a web browser on a phone or a computer, so there is nothing to install and no equipment to buy. Fees are in rupees, payments can be taken by UPI, and members are reached on WhatsApp.' },
          { type: 'p', text: 'Have a question that is not answered here? Read the [frequently asked questions](/#faq) or write to [support@gymflow.sbs](mailto:support@gymflow.sbs).' },
        ],
      },
    ],
  },
  {
    slug: 'members',
    ogImage: '/og/members.jpg',
    ogAlt: 'GymFlow card: Member management for gyms in India.',
    title: 'Gym Member Management Software for India — GymFlow',
    description: 'Gym member management software for Indian gyms: member records, plans, expiry dates, renewals, search and filters, with a WhatsApp welcome. 14-day free trial.',
    h1: 'Gym member management software for India',
    eyebrow: 'Member management',
    intro: 'GymFlow is gym member management software that keeps every member, plan, expiry date and payment in one place, so a question like "who is expiring this week?" takes seconds instead of a search through notebooks and spreadsheets.',
    breadcrumb: 'Member management',
    cardTitle: 'Member management',
    cardText: 'Member records, plans, expiry dates, search and filters, renewals and one-tap WhatsApp.',
    icon: 'users',
    related: ['fees-and-dues', 'member-app', 'import-export'],
    tutorial: tutorialSlot('members', 'How member management works in GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'What a member record holds',
        blocks: [
          { type: 'p', text: 'Every member has one record you can open from the Members page. It holds:' },
          {
            type: 'ul',
            items: [
              '**Personal details:** name, mobile number, gender, age, date of birth (used for birthday wishes) and area or locality.',
              '**Member ID:** a number GymFlow suggests, shown like GF0042. You can change it if your gym already numbers its members.',
              '**Plan:** monthly, quarterly, annual, or a custom length of your own from 1 to 24 months, in strength, cardio, or strength plus cardio. You can save your own plans with your own fees.',
              '**Fees:** admission fee, membership fee, how the member paid (cash, UPI or card) and any amount still pending.',
              '**History:** every payment and recent attendance, on the same screen.',
            ],
          },
        ],
      },
      {
        heading: 'How to add a member',
        blocks: [
          {
            type: 'ol',
            items: [
              'Open **Add Member** and enter the name and 10-digit mobile number. The next free member ID is already filled in.',
              'Choose the plan, the category and the start date. GymFlow works out the expiry date from the plan.',
              'Enter the membership fee, any admission fee and any amount still pending, then pick how the member paid. For UPI, GymFlow can show a payment QR code for you (see [fees and dues](/fees-and-dues)).',
              'Check the confirmation screen and save. The member receives a welcome message on WhatsApp, once.',
            ],
          },
        ],
      },
      {
        heading: 'Renewals and expiry',
        blocks: [
          { type: 'p', text: 'Open any member and tap **Renew**. Pick the plan, start date, amount and payment mode. GymFlow saves the renewal, sends the member a renewal confirmation on WhatsApp and stops any expiry reminders that were still going out for the old plan.' },
          { type: 'p', text: 'The member list marks each person as **Active**, **Expiring** (7 days or fewer left) or **Expired**, so you can see at a glance who needs a call.' },
        ],
      },
      {
        heading: 'Find the right members quickly',
        blocks: [
          {
            type: 'ul',
            items: [
              'Search by name or phone number, or by member ID.',
              'Filter the list by All, Active, Expiring or Expired.',
              'Use Advanced filters for plan, payment status (fully paid, partly paid, unpaid), age range, gender and when the member joined.',
              'Use the one-tap filters: Active + Expiring Soon, Unpaid + Overdue, and New this Month.',
              'If two members ever end up with the same ID, GymFlow warns you and can renumber them in one tap.',
              'On a larger screen, edit many members in one table with the bulk editor, and review all changes before saving.',
              'Export the filtered list to Excel by status and joining date.',
            ],
          },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Can I use the member IDs my gym already has?' },
          { type: 'p', text: 'Yes. GymFlow suggests the next free ID, shown like GF0042, but you can change it when you add a member. If two members ever end up with the same ID, GymFlow warns you and can renumber them in one tap, so every ID still points to exactly one person.' },
          { type: 'h3', text: 'Can I sell plan lengths other than monthly, quarterly and annual?' },
          { type: 'p', text: 'Yes. Choose a custom length from 1 to 24 months, or save your own plans with your own fees. When you add or renew a member, GymFlow works out the expiry date from the start date and the plan, so you never count days by hand.' },
          { type: 'h3', text: 'How do I see who needs to renew this week?' },
          { type: 'p', text: 'Filter the member list by Expiring, which shows members with 7 days or fewer left, or use the one-tap Active + Expiring Soon filter. Open a member and tap Renew to record the new plan. GymFlow then sends the renewal confirmation on WhatsApp and stops the old reminders.' },
          { type: 'h3', text: 'Can I edit many members at once?' },
          { type: 'p', text: 'On a larger screen, open the bulk editor to change many members in one table. You review all the changes before saving, so one slip does not quietly overwrite your records. To load a whole list for the first time, import an Excel or CSV file instead.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Expiring** means 7 days or fewer left on the current plan. Once the end date passes, the member shows as Expired.',
              'WhatsApp messages only go to members with a valid 10-digit mobile number, so keep numbers complete.',
              'Deleting a member asks you to confirm and cannot be undone. It also removes that member\'s attendance and membership records. Export your members to Excel first if you want a copy.',
              'The bulk editor is for larger screens. On a phone, edit one member at a time from the member list.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners of independent gyms and fitness studios who still keep members in a register or a spreadsheet and want to stop chasing renewals by memory. Nothing to install: it runs in a web browser on a phone or a computer. If you already have a list, [import it from Excel or CSV](/import-export) instead of typing it again.' },
        ],
      },
    ],
  },
  {
    slug: 'fees-and-dues',
    ogImage: '/og/fees-and-dues.jpg',
    ogAlt: 'GymFlow card: Fees and dues tracking for gyms in India.',
    title: 'Gym Fee and Dues Management Software for India — GymFlow',
    description: 'Track gym fees and pending dues in one place: record cash, UPI and card payments, collect part payments, and remind members on WhatsApp. 14-day free trial.',
    h1: 'Gym fee and dues management software',
    eyebrow: 'Fees and dues',
    intro: 'GymFlow is gym fee management software: know who has paid, who owes you and how much, without opening a notebook. It records every fee by cash, UPI or card, keeps a running list of pending dues and reminds members on WhatsApp until they pay.',
    breadcrumb: 'Fees and dues',
    cardTitle: 'Fees and dues',
    cardText: 'Record cash, UPI and card payments, collect part payments and see who owes what.',
    icon: 'rupee',
    related: ['members', 'whatsapp', 'reports'],
    tutorial: tutorialSlot('fees-and-dues', 'How fees and dues work in GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'What you can do',
        blocks: [
          {
            type: 'ul',
            items: [
              'Record a payment when you add a member or renew a plan: membership fee, admission fee and payment mode (cash, UPI or card).',
              'Take part payments. Whatever the member has not paid yet stays on their record as a pending due.',
              'See the collection for today, this week, this month, all time or any dates you choose, split into cash, UPI and card.',
              'Switch between membership payments, inventory sales and due payments in separate tabs, and search by member name or ID.',
              'Download payments to Excel for your accountant.',
            ],
          },
        ],
      },
      {
        heading: 'How collecting a due works',
        blocks: [
          {
            type: 'ol',
            items: [
              'Open the **Dues** page. Every member with an amount pending is listed with the amount in red. Search by name, phone number or member ID.',
              'Tap the rupee button next to the member. The full pending amount is filled in; change it if they are paying only part.',
              'Choose cash, UPI or card and save. If they paid less than the full amount, the rest stays pending. Once it is cleared, the member leaves the list.',
            ],
          },
          { type: 'p', text: 'The green WhatsApp button next to each member opens a ready-written message in your own WhatsApp, so you can nudge someone in a few seconds.' },
        ],
      },
      {
        heading: 'UPI payments with your own QR code',
        blocks: [
          { type: 'p', text: 'In Account settings you upload a picture of your UPI QR code, or scan it with your phone camera. GymFlow reads your UPI ID and payee name from it and shows them for you to confirm.' },
          { type: 'p', text: 'After that, when you add a member and choose UPI, GymFlow can show a payment QR code for the amount to collect. The member scans it with any UPI app and the money goes straight to your own account. You can also choose to collect it yourself.' },
          { type: 'note', text: 'GymFlow does not hold your money, and it does not look into your bank account. Once you see the payment arrive, you tap **Mark as Collected** yourself.' },
        ],
      },
      {
        heading: 'Automatic payment due reminders',
        blocks: [
          { type: 'p', text: 'When a member has an amount pending, GymFlow sends a payment due reminder on WhatsApp with the amount. It repeats every 3 days, up to 7 times, and stops as soon as the due is paid in full. See [WhatsApp reminders](/whatsapp) for the full schedule.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Can a member pay in instalments?' },
          { type: 'p', text: 'Yes. Enter what the member pays now, and whatever is left stays on their record as a pending due. Each time they pay part of it on the Dues page, the balance goes down. Once it is cleared the member leaves the list. There is no fixed number of instalments.' },
          { type: 'h3', text: 'Does GymFlow collect the money for me?' },
          { type: 'p', text: 'No. A UPI payment goes straight from the member to your own account, using your own QR code. GymFlow does not hold your money or look into your bank account, so you tap Mark as Collected yourself once the payment arrives.' },
          { type: 'h3', text: 'How do I see how much came in by cash, UPI and card?' },
          { type: 'p', text: 'Open the Payments page and choose today, this week, this month, all time or your own dates. The total is split into cash, UPI and card. Membership payments, inventory sales and due payments sit in separate tabs, and you can search by member name or ID.' },
          { type: 'h3', text: 'When do the payment reminders stop?' },
          { type: 'p', text: 'GymFlow sends a payment due reminder on WhatsApp with the amount, repeats it every 3 days up to 7 times, and stops the moment the due is paid in full. Only members with a valid 10-digit mobile number receive it.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'GymFlow records payments; it is not a payment gateway. It does not take card or UPI payments on your behalf, and it does not create GST invoices.',
              'Only members with an amount pending appear on the Dues page, with the amounts shown in red.',
              'A due you collect later is saved as a separate due payment, so it shows in its own tab on the Payments page.',
              'The green WhatsApp button on the Dues page opens a message in your own WhatsApp. It is sent from your number, not from GymFlow.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gym owners who collect fees in cash and UPI, let regulars pay part now and part later, and today keep track of balances in a notebook or in their head. Every payment is recorded against the member, so the question "has he paid?" always has an answer. To see the totals across months, open [reports and analytics](/reports).' },
        ],
      },
    ],
  },
  {
    slug: 'attendance',
    ogImage: '/og/attendance.jpg',
    ogAlt: 'GymFlow card: Attendance tracking with a front-desk kiosk.',
    title: 'Gym Attendance Tracking Software and Kiosk — GymFlow',
    description: 'Gym attendance software with a front-desk check-in kiosk: members enter their ID, you get check-in and check-out times, a searchable log and Excel export.',
    h1: 'Gym attendance tracking software with a check-in kiosk',
    eyebrow: 'Attendance tracking',
    intro: 'GymFlow tracks gym attendance with a front-desk check-in kiosk. Open the attendance page on a tablet or phone at your desk, members type their member ID, and GymFlow records the visit, the session and how long they stayed.',
    breadcrumb: 'Attendance tracking',
    cardTitle: 'Attendance tracking',
    cardText: 'A check-in kiosk for your front desk, with check-out times and a full attendance log.',
    icon: 'calendar-check',
    related: ['member-app', 'reports', 'members'],
    tutorial: tutorialSlot('attendance', 'How the attendance kiosk works in GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'How check-in works',
        blocks: [
          {
            type: 'ol',
            items: [
              'Open **Attendance** on any phone, tablet or computer at the desk. The box for the member ID is ready to type in.',
              'Check the session at the top right: **Morning** or **Evening**. It picks one from the time of day on your device, and you can switch it with one tap.',
              'The member types the digits of their member ID and taps **Confirm**.',
              'A full-screen result shows the member\'s name, member ID and plan expiry date, then clears itself after a few seconds so the next person can go.',
              'When the member leaves, they enter the ID again in the same session. GymFlow records the check-out time and shows how long they trained.',
            ],
          },
          { type: 'p', text: 'If someone types the wrong number, the result screen has an **Entered wrong number? Re-enter ID** button. It reverses exactly that entry, removing the wrong check-in or clearing the wrong check-out, so the wrong person is not marked present. The page also shows the total checked in today.' },
        ],
      },
      {
        heading: 'No hardware to buy',
        blocks: [
          { type: 'p', text: 'The kiosk is a web page. There is no turnstile, scanner or biometric device to install, and nothing to set up beyond logging in. It records visits; it does not lock or unlock your door.' },
        ],
      },
      {
        heading: 'Where your attendance records show up',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Dashboard:** today\'s attendance count, one tap from the attendance page.',
              '**Attendance log:** every check-in with date, member, session, check-in and check-out time and duration. Search it, filter by today, last 7 days, last 30 days, all time or custom dates, and export it to Excel.',
              '**Member profile:** each member\'s recent attendance sits next to their payments.',
              '**Reports:** the attendance report lists members with a current plan who have not checked in for 7 days or more, and shows your busiest days of the week over the last 90 days. See [reports and analytics](/reports).',
              '**Member app:** members see their own attendance calendar and progress, and attended days build their streak. See the [member app](/member-app).',
            ],
          },
        ],
      },
      {
        heading: 'Morning and evening sessions',
        blocks: [
          { type: 'p', text: 'Many gyms run separate morning and evening batches, so GymFlow records the session with every visit. A member can check in once per session each day. If a member comes to both, the visits are kept separately in the log, while streaks in the member app count that as one attended day.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Do members need a smartphone to check in?' },
          { type: 'p', text: 'No. The kiosk is a page on your own phone, tablet or computer at the desk, and the member types their member ID digits there. Members do not need the member app to be counted. The kiosk works only while you are signed in on that device.' },
          { type: 'h3', text: 'Does the kiosk use QR codes, fingerprints or door access?' },
          { type: 'p', text: 'No. Check-in takes a typed member ID. The QR code on a member\'s digital card is for showing at the entrance, and the kiosk does not scan it. There is no biometric reader, and GymFlow does not open or lock your door.' },
          { type: 'h3', text: 'What happens when a member with an expired plan checks in?' },
          { type: 'p', text: 'GymFlow still records the visit and shows the plan expiry date on the result screen, or "No active plan" if there is none. It does not block the entry, so your front-desk staff can see the date and decide what to do.' },
          { type: 'h3', text: 'How do I find members who have stopped coming?' },
          { type: 'p', text: 'Open the attendance report under Reports. It lists members with a current plan who have not checked in for 7 days or more, so you can message them before the plan lapses. Members who joined this week are left out of that list.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'The kiosk saves every check-in to your account as it happens, so it needs an internet connection.',
              'Days follow India time, so a late-evening visit counts for that day and not the next.',
              'Check-out works by entering the same ID again in the same session. A member who forgets to check out still has a check-in on record.',
              'Undo is for fixing a typing mistake right after it happens. It reverses only a recent action in your own gym.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gyms that want to know who actually turns up, to spot members who have stopped coming before they quietly lapse, and to give busy front-desk staff a one-field screen instead of a register. Pair it with [member management](/members) so every ID maps to a plan and expiry date.' },
        ],
      },
    ],
  },
  {
    slug: 'member-app',
    ogImage: '/og/member-app.jpg',
    ogAlt: 'GymFlow card: Member app and workouts for gym members.',
    title: 'Gym Member App with Workouts and Leaderboards — GymFlow',
    description: 'Give gym members their own app: digital membership card, assigned workout programs, attendance streaks, leaderboards and rewards. No app store download.',
    h1: 'Gym member app with workouts, digital card and leaderboards',
    eyebrow: 'Member app and workouts',
    intro: 'GymFlow gives every member their own app on their phone. It opens from a link you send on WhatsApp and installs to the home screen, so there is no app store download.',
    breadcrumb: 'Member app and workouts',
    cardTitle: 'Member app and workouts',
    cardText: 'A member app with a digital card, workout programs, streaks, leaderboards and rewards.',
    icon: 'smartphone',
    related: ['workout-programs', 'attendance', 'whatsapp'],
    tutorial: tutorialSlot('member-app', 'How the GymFlow member app works'),
    screenshots: [],
    sections: [
      {
        heading: 'What members see',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Home:** membership status and days left, current streak and a weekly goal ring.',
              '**Digital membership card:** name, plan, expiry date, member ID and a QR code to show at the gym entrance.',
              '**Membership:** plan, expiry date and membership history.',
              '**Attendance and progress:** an attendance calendar, plus total check-ins, check-ins this month and this week.',
              '**Workouts:** the programs your gym has assigned, day by day, with a guided session that shows each set and runs a rest timer.',
              '**Leaderboard and rewards:** streaks, XP, levels, badges and challenges.',
            ],
          },
        ],
      },
      {
        heading: 'Workout programs you assign',
        blocks: [
          { type: 'p', text: 'On the Programs page you build a workout plan: name, summary, number of weeks, days per week, difficulty, goal and equipment. Then add exercises for each day of the week with sets, reps, weight and rest. Assign the plan to the members it suits. They see it in their app, tap **Start Workout**, and are walked through it set by set. Days without exercises show as rest days. See [workout programs](/workout-programs) for the full builder.' },
        ],
      },
      {
        heading: 'Streaks, leaderboards and rewards',
        blocks: [
          { type: 'p', text: 'Everything is worked out from real attendance and renewals, so there is nothing for you to update by hand.' },
          {
            type: 'ul',
            items: [
              '**Streaks** count the days a member actually attended. Morning and evening on the same day count as one day.',
              '**XP and levels:** members earn XP for check-ins, renewals and activating the app. A new level comes every 300 XP. You can set the XP amounts and add bonus rules, such as extra XP on chosen days of the week.',
              '**Leaderboards** for the last 7 days, the last 30 days, streaks and all-time XP. Other members see masked names such as "Akhil P.", and each member can choose to stay off the boards.',
              '**Badges and weekly goals** that you can tune from the owner side.',
              '**Prizes:** set a weekly and a monthly prize, and mark the leader\'s prize as awarded once you hand it over.',
              '**Events:** create your own challenge, for example a 7-day festival challenge, with dates, a goal, bonus XP and an optional item reward.',
              'Leaderboards can be switched off for your gym. Members still keep their streak, XP and badges.',
            ],
          },
        ],
      },
      {
        heading: 'How to invite members',
        blocks: [
          {
            type: 'ol',
            items: [
              'Open **Member App** on the owner side. Enable portal access for one member or many at once.',
              'Send the invitation. GymFlow sends the member a WhatsApp message with a personal link.',
              'The member opens the link within 24 hours and sets their email and a password of at least 8 characters, then confirms the verification email.',
              'They sign in and add the app to their home screen. You can follow each invitation as Not Invited, Pending or Activated, and resend or suspend access any time.',
            ],
          },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Do my members have to download the app from a store?' },
          { type: 'p', text: 'No. The member app opens from a personal link sent on WhatsApp and installs to the home screen from the browser. The member opens the link within 24 hours, sets an email and a password of at least 8 characters, and confirms the verification email.' },
          { type: 'h3', text: 'Can members see each other\'s details?' },
          { type: 'p', text: 'Leaderboards show other members only as masked names such as "Akhil P.", and each member can choose to stay off the boards from their profile. You can also switch leaderboards off for your whole gym, and members still keep their own streak, XP and badges.' },
          { type: 'h3', text: 'Can I stop a member\'s access or resend a lost link?' },
          { type: 'p', text: 'Yes. On the Member App page you can follow each invitation as Not Invited, Pending or Activated, resend an invitation, and suspend access at any time. You can enable access for one member or for many members at once. Each invitation carries a personal link, so every member signs in with their own details.' },
          { type: 'h3', text: 'Does a workout done in the app count as attendance?' },
          { type: 'p', text: 'No. Attendance, streaks and XP come from check-ins at your front desk. A workout a member follows in the app does not mark them present. That keeps streaks honest, because they count only the days a member actually attended. Working out at home does not add a streak day.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'The app needs an internet connection. It keeps only fixed files such as scripts and icons on the phone, never your gym\'s data, so nothing a member sees is stored for offline use.',
              'The QR code on the digital card shows the member ID. Your check-in kiosk takes a typed ID and does not scan it.',
              'Leaderboards cover the last 7 days, the last 30 days, streaks and all-time XP, so they roll forward day by day rather than restarting on a calendar date.',
              'Members only see workout programs that you have published and assigned to them.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gym owners who want members to feel looked after between visits: a clear card to show, a plan to follow and a reason to come back tomorrow. It sits on top of your [attendance records](/attendance), so members earn streaks just by checking in at the kiosk.' },
        ],
      },
    ],
  },
  {
    slug: 'workout-programs',
    ogImage: '/og/workout-programs.jpg',
    ogAlt: 'GymFlow card: Workout programs you build and assign to gym members.',
    title: 'Gym Workout Program Software: Build and Assign — GymFlow',
    description: 'Build workout programs for your gym with weeks, days, sets and reps, publish them, and assign them to members who follow them in their own app. Free trial.',
    h1: 'Gym workout programs you build once and assign to members',
    eyebrow: 'Workout programs',
    intro: 'GymFlow lets you build a workout program once, publish it and assign it to some or all of your members. They follow it day by day in their own app, with each set listed and a rest timer to run.',
    breadcrumb: 'Workout programs',
    cardTitle: 'Workout programs',
    cardText: 'Build day-by-day programs with sets, reps and rest, assign them to members and let them follow along in the app.',
    icon: 'dumbbell',
    related: ['member-app', 'attendance', 'members'],
    tutorial: tutorialSlot('workout-programs', 'How workout programs work in GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'What a program holds',
        blocks: [
          { type: 'p', text: 'Open **Programs** and tap **Create Program**. Each program has:' },
          {
            type: 'ul',
            items: [
              '**Name and summary:** a title such as "12-Week Powerbuilding Phase 1", a one-line summary and optional detailed notes for warm-ups or diet advice.',
              '**Length:** 4, 6, 8, 10, 12 or 16 weeks, with 1 to 7 training days per week.',
              '**Difficulty:** Beginner, Intermediate or Advanced.',
              '**Goal:** Build Muscle, Lose Fat, Improve Strength, Endurance or Athletic Performance.',
              '**Category:** Strength, Hypertrophy, Fat Loss, Powerlifting, Mobility, CrossFit or Functional Fitness.',
              '**Equipment and audience:** Full Gym, Dumbbells Only, Home Workout, Resistance Bands or Machines Only, plus who it is for and the experience level it suits.',
            ],
          },
        ],
      },
      {
        heading: 'How to build a program',
        blocks: [
          {
            type: 'ol',
            items: [
              'Fill in the program details and tap **Continue to Builder**.',
              'Pick a day of the week. Search the exercise library and tap an exercise to add it, or type a new name to add your own on the spot.',
              'Set the sets for each exercise. Strength exercises take reps, weight, rest, effort and tempo. Cardio takes duration, intensity and distance. Mobility takes hold time and rounds.',
              'Use the week selector to move between weeks. The copy button carries the previous week\'s sets forward so you only change what progresses. Drag exercises to put them in order.',
              'Tap **Publish Plan** to make it available, or **Save Draft** to keep working on it later.',
            ],
          },
          { type: 'p', text: 'Reps, weight and rest are plain text, so you can write "8-10" reps or "90s" rest. A day with no exercises is a rest day.' },
        ],
      },
      {
        heading: 'Assigning programs to members',
        blocks: [
          { type: 'p', text: 'Open a program and tap **Assign Members**. You can assign it to every member, or search by name, phone number or member ID and pick specific people. Members who already have the program are not added twice, and you can remove the program from chosen members at any time.' },
        ],
      },
      {
        heading: 'What members see',
        blocks: [
          {
            type: 'ul',
            items: [
              'A **Workout** tab in the [member app](/member-app) lists the programs assigned to them.',
              'Opening a program shows its length, days per week and goal, with a tab for each training day. Today\'s tab is marked.',
              'Each exercise lists its sets with reps, weight and rest, and any note you added.',
              '**Start Workout** begins a guided session. The member ticks off each set, a rest countdown runs between sets with a **Skip Rest** button, and a session timer keeps the total time.',
              'At the end they see a summary: time taken, exercises, sets completed, total reps and the weight lifted.',
            ],
          },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Do members see a program before I publish it?' },
          { type: 'p', text: 'No. A draft is visible only to you. Members see only programs that are published and assigned to them. Publishing needs at least one exercise, so an empty program cannot go live by mistake, and saving a draft lets you keep working without showing it.' },
          { type: 'h3', text: 'Can I change or delete a program later?' },
          { type: 'p', text: 'Yes. Open the program from the Programs page to edit it, or delete it after a confirmation. Deleting a program also removes it from every member it was assigned to, so note down anything you want to keep first. Members who already have it will no longer see it.' },
          { type: 'h3', text: 'Does a finished workout count as attendance?' },
          { type: 'p', text: 'No. The workout summary appears on the member\'s own phone. Attendance, streaks and XP come from check-ins at your front desk, so a workout followed in the app does not mark anyone present. A member still checks in at the front-desk kiosk with their member ID, and that check-in is what counts toward their streak.' },
          { type: 'h3', text: 'Is there a list of exercises to choose from?' },
          { type: 'p', text: 'Yes. The builder has a searchable library, mostly strength exercises for chest, back, legs, shoulders, arms and abs, plus a few cardio and mobility entries. If an exercise is missing, type its name and add it as a custom exercise.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'The member\'s day view and guided session show each exercise\'s sets from the first week you filled in. Changes you build for later weeks are saved in the program, but are not yet shown week by week to the member.',
              'The rest timer reads the number in the rest field, so "90s" counts down from 90 seconds.',
              'Members need an internet connection to open their program. See the [member app](/member-app) for what the app stores on the phone.',
              'Programs reach a member only after you invite them to the member app and assign the program.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gym owners and trainers who write the same routines again and again on paper or in chats. Build each plan once, assign it to the members it suits, and keep your coaching in one place. Members get a clear plan to follow, and you still track who actually turns up with [attendance tracking](/attendance).' },
        ],
      },
    ],
  },
  {
    slug: 'whatsapp',
    ogImage: '/og/whatsapp.jpg',
    ogAlt: 'GymFlow card: Automatic WhatsApp reminders for gyms.',
    title: 'WhatsApp Reminders for Gyms, Sent Automatically — GymFlow',
    description: 'Automatic WhatsApp messages for your gym: welcome, renewal, expiry, expired, payment due and birthday reminders with no per-message charge. 14-day free trial.',
    h1: 'WhatsApp reminders for gyms, sent automatically',
    eyebrow: 'WhatsApp reminders',
    intro: 'GymFlow sends WhatsApp reminders for your gym automatically: welcome, renewal, expiry, expired, payment due and birthday messages. Members forget to renew and forget what they owe, and the right message goes out at the right time, so you do not have to remember to ask.',
    breadcrumb: 'WhatsApp reminders',
    cardTitle: 'WhatsApp reminders',
    cardText: 'Automatic welcome, renewal, expiry, due and birthday messages. No per-message charge.',
    icon: 'message',
    related: ['fees-and-dues', 'members', 'member-app'],
    tutorial: tutorialSlot('whatsapp', 'How WhatsApp reminders work in GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'The messages GymFlow sends',
        blocks: [
          { type: 'h3', text: 'Welcome message' },
          { type: 'p', text: 'Sent once when you add a new member, with the plan, start date and member ID.' },
          { type: 'h3', text: 'Renewal confirmation' },
          { type: 'p', text: 'Sent when you renew a membership, with the plan and the date it is valid until.' },
          { type: 'h3', text: 'Expiry reminder' },
          { type: 'p', text: 'Starts 18 days before the plan ends and tells the member how many days are left.' },
          { type: 'h3', text: 'Membership expired' },
          { type: 'p', text: 'If the member has not renewed, a message after the end date asks them to come back, for up to 18 days.' },
          { type: 'h3', text: 'Payment due reminder' },
          { type: 'p', text: 'Sent when a member has an amount pending, and names the amount.' },
          { type: 'h3', text: 'Birthday wishes' },
          { type: 'p', text: 'Sent on the member\'s birthday, if you saved their date of birth.' },
          { type: 'h3', text: 'Member app invitation' },
          { type: 'p', text: 'Sent when you invite a member to the [member app](/member-app), with their personal link.' },
        ],
      },
      {
        heading: 'How the schedule works',
        blocks: [
          {
            type: 'ul',
            items: [
              'Reminders for expiry, expired memberships and dues are checked once a day, in the morning (about 9 AM India time).',
              'Each reminder repeats every 3 days, up to 7 times, then stops.',
              'The moment you renew a plan, its expiry reminders stop. The moment a due is paid in full, its payment reminders stop.',
              'A member never gets the same reminder twice on one day.',
              'Only members with a valid 10-digit mobile number receive messages.',
              'Scheduled messages are queued and sent in small batches, so a very large list can take a while to finish.',
            ],
          },
        ],
      },
      {
        heading: 'Sending a message yourself',
        blocks: [
          { type: 'p', text: 'Open any member and tap **WhatsApp**. Choose one of the approved messages (welcome, renewed, expiry reminder, expired, payment due or birthday), read the preview and send it. On the Dues and Reports pages, the WhatsApp button opens a ready-written message in your own WhatsApp for you to send.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Can I change the wording of the messages?' },
          { type: 'p', text: 'No. The messages use templates approved by Meta, the company behind WhatsApp, so the wording is fixed. Each one carries your gym\'s name and the member\'s name, plus details such as the plan, the dates or the amount due. What you control is who you add and what you record.' },
          { type: 'h3', text: 'Do I need my own WhatsApp Business account?' },
          { type: 'p', text: 'No. Messages go out from GymFlow\'s WhatsApp Business number, so there is nothing to register or connect on your side. The reminders appear in your member\'s WhatsApp like any other business message, with your gym\'s name inside the text. Your only job is to keep each member\'s mobile number correct.' },
          { type: 'h3', text: 'How many reminders will a member get?' },
          { type: 'p', text: 'Expiry, expired and payment due reminders are checked once a day, about 9 AM India time, and repeat every 3 days up to 7 times. They stop when you renew a plan or the due is paid in full, and a member never gets the same reminder twice in one day.' },
          { type: 'h3', text: 'What if I add hundreds of members at once?' },
          { type: 'p', text: 'Scheduled messages wait in a queue and go out in small batches, so a very large list can take a while to finish. A message that cannot be sent straight away is held and tried again later. Importing members never sends welcome messages.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'Messages go out through the official WhatsApp Business Platform using message templates approved by Meta. The wording is fixed by those templates, so owners cannot edit the text.',
              'WhatsApp messages are unlimited on every plan, with no per-message charge.',
              'The message buttons on the Dues and Reports pages open a ready-written message in your own WhatsApp. Those are sent from your number, not from GymFlow.',
              'You are responsible for having your members\' permission to contact them on WhatsApp. Members can ask your gym to stop messaging them.',
              'When you [import members](/import-export), those whose plan ends soon or ended in the last two months are reminded straight away. Nobody gets a welcome message from an import.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners who spend part of every week phoning members to renew or pay. Add your members once, and the reminders run on their own. Pair it with [fees and dues](/fees-and-dues) so every payment you record stops the right reminder.' },
        ],
      },
    ],
  },
  {
    slug: 'reports',
    ogImage: '/og/reports.jpg',
    ogAlt: 'GymFlow card: Reports and analytics for gym owners.',
    title: 'Gym Reports and Analytics Software for Owners — GymFlow',
    description: 'Gym reports in plain English: member growth, monthly collection, pending dues, plans ending soon and members who stopped coming. Download a PDF. Free trial.',
    h1: 'Gym reports and analytics software for owners',
    eyebrow: 'Reports and analytics',
    intro: 'GymFlow reports answer five questions on one page: who are my members, how much money came in, who owes me, who is about to leave and who has stopped coming. Each answer starts with a sentence you can read in a few seconds.',
    breadcrumb: 'Reports and analytics',
    cardTitle: 'Reports and analytics',
    cardText: 'Five plain-English reports on members, money, dues, expiries and attendance, plus PDF.',
    icon: 'chart',
    related: ['fees-and-dues', 'attendance', 'whatsapp'],
    tutorial: tutorialSlot('reports', 'How GymFlow reports work'),
    screenshots: [],
    sections: [
      {
        heading: 'The five reports',
        blocks: [
          { type: 'h3', text: 'Members' },
          { type: 'p', text: 'How many members are active out of the total, how many joined and renewed this month, and how many have no current plan. Charts show new members and renewals for each of the last six months, the plans your active members are on, and which areas your members come from.' },
          { type: 'h3', text: 'Money' },
          { type: 'p', text: 'What you have collected this month, compared with last month and with a usual month. A chart shows the money collected in each of the last six months, counted in the month it was paid. A breakdown shows how this month\'s money came in: UPI, cash or card.' },
          { type: 'h3', text: 'Dues' },
          { type: 'p', text: 'The total pending and how many members owe it, with the largest dues first. Each row has a message button that opens a ready-written WhatsApp reminder in your own WhatsApp.' },
          { type: 'h3', text: 'Leaving' },
          { type: 'p', text: 'How many plans end this week and in the next 30 days, and what they are worth if everyone renews. A list shows who is ending soon, and another shows members whose plan ended in the last 30 days and who have not renewed, each with a one-tap message to reach them.' },
          { type: 'h3', text: 'Attendance' },
          { type: 'p', text: 'Check-ins today, your busiest and quietest day of the week and the share of check-ins in the morning, from the last 90 days. It also lists members with a current plan who have not checked in for 7 days or more, so you can reach them before they lapse. Members who joined this week are left out.' },
        ],
      },
      {
        heading: 'How to use it',
        blocks: [
          {
            type: 'ol',
            items: [
              'Open **Reports** and pick one of the five tabs. The tab for Dues, Leaving and Attendance shows a red number when something needs your attention.',
              'Read the headline sentence at the top, then scroll to the chart or list underneath.',
              'Tap a message button to remind someone on WhatsApp, or follow the link at the bottom of a report to the page where you can act on it.',
              'Tap **Download PDF** for a summary of members, collection, dues, expiries and today\'s check-ins to share or keep.',
            ],
          },
        ],
      },
      {
        heading: 'Why the numbers can be trusted',
        blocks: [
          { type: 'p', text: 'Reports are built from the same records you already keep: members, memberships, payments, dues and attendance. There is no separate data to maintain. If you record a payment or a check-in, it shows up in the numbers.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Can I choose my own date range?' },
          { type: 'p', text: 'Reports use fixed windows: this month against last month, the last six months in the charts, the next 30 days for expiries and the last 90 days for attendance. For any other period, use the Payments page, which takes custom dates, or the attendance log, and export either to Excel.' },
          { type: 'h3', text: 'What counts as money collected?' },
          { type: 'p', text: 'The Money report adds membership fees, including admission fees and minus any amount left pending, the due payments you collect later and inventory sales. Each is counted on the day it was entered, in India time, and split into UPI, cash and card.' },
          { type: 'h3', text: 'Can I share a report with my accountant or partner?' },
          { type: 'p', text: 'Tap Download PDF for a summary of members, collection, dues, expiries and today\'s check-ins. For line-by-line records, download payments, members or attendance to Excel from their own pages. The PDF is a quick summary to share, while the Excel files hold the detail behind it, so your accountant can work from the same figures you see.' },
          { type: 'h3', text: 'What can I do about a number I see?' },
          { type: 'p', text: 'Dues, Leaving and Attendance each have message buttons that open a ready-written WhatsApp message in your own WhatsApp. Each report also links to the page where you can fix the record, such as recording a due payment. Messages go from your own WhatsApp number, so members see a familiar sender.' },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'Members brought in by an [Excel import](/import-export) are left out of the new members chart, because they were all created on the day of the import.',
              'An imported plan is a record of a plan the member paid for before joining GymFlow, so it is not counted as money collected.',
              'Dues are listed with the largest amount first, so the biggest balances are the first you see.',
              'Reports only know what you record. A payment or a check-in you forget to enter will not appear in the numbers.',
            ],
          },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners who want to run the gym by facts rather than feel. Use it at the end of the week to decide who to call, and at the start of the month to see how the last one went. The reports are only as complete as the records behind them, so they work best with [attendance](/attendance) and [payments](/fees-and-dues) recorded as they happen.' },
        ],
      },
    ],
  },
  {
    slug: 'import-export',
    ogImage: '/og/import-export.jpg',
    ogAlt: 'GymFlow card: Import gym members from Excel or CSV and export your data.',
    title: 'Import Gym Members from Excel or CSV, Export Data — GymFlow',
    description: 'Move your gym from Excel or CSV to GymFlow: map columns and plans, preview before saving, then export members, payments and attendance to Excel anytime.',
    h1: 'Import gym members from Excel or CSV, and export your data',
    eyebrow: 'Import and export',
    intro: 'GymFlow imports gym members from an Excel or CSV file and exports your data back to Excel whenever you like. Already have your members in a spreadsheet? Upload the file and GymFlow matches your columns, plans and phone numbers. You see a preview first, and nothing is saved until you confirm.',
    breadcrumb: 'Import and export',
    cardTitle: 'Import and export',
    cardText: 'Move your members in from Excel or CSV with a preview, and export your data to Excel.',
    icon: 'upload',
    related: ['members', 'whatsapp', 'reports'],
    tutorial: tutorialSlot('import-export', 'How to import members from Excel into GymFlow'),
    screenshots: [],
    sections: [
      {
        heading: 'How the import works',
        blocks: [
          {
            type: 'ol',
            items: [
              '**Upload your file.** Choose a CSV, XLSX or XLS file. The first row should hold the column headings.',
              '**Map fields.** GymFlow guesses which of your columns is the name, phone, plan, start date and so on. Correct any it got wrong.',
              '**Map plans.** If your file calls plans something GymFlow does not recognise, link each one to Monthly, Quarterly or Annual.',
              '**Assign member IDs.** GymFlow numbers the members for you, or keeps the member numbers from your file where it can, and flags any clashes.',
              '**Preview and confirm.** Review every row, fix mistakes, and see how many rows will be skipped. Only when you confirm are the members saved.',
            ],
          },
        ],
      },
      {
        heading: 'What it understands',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Columns:** name, phone, member number, plan, category, start date, fee, payment mode, gender, age, date of birth and area. Name and phone are the essentials. A missing plan is treated as monthly and a missing start date as today.',
              '**Phone numbers:** numbers written with spaces, +91 or a leading 0 are tidied into 10-digit Indian mobile numbers. A number that cannot be fixed is flagged, and that member receives no WhatsApp messages.',
              '**Dates and values:** common date formats and Excel date cells are read correctly, and gender and payment mode are matched from the words you used.',
              '**Plan prices:** if a row has no fee, GymFlow can fill it in from the prices you have set for each plan.',
            ],
          },
        ],
      },
      {
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'One import saves up to 500 members. For a longer list, split the file and import it in parts.',
              'Imported members whose plan is ending soon, or ended in the last two months, are reminded on WhatsApp straight away. Nobody gets a welcome message from an import. See [WhatsApp reminders](/whatsapp).',
              'The file can be up to 10 MB. A spreadsheet that is too large is refused, so remove unused sheets and rows first.',
              'An imported plan records the plan dates only. No payment is created, so it is not counted as money collected, and imported members are left out of the new members chart in [reports](/reports).',
              'A phone number that cannot be fixed is flagged in the preview, and that member receives no WhatsApp messages until you correct it.',
            ],
          },
        ],
      },
      {
        heading: 'Exporting your data',
        blocks: [
          { type: 'p', text: 'Your data stays yours. You can download it to Excel (.xlsx) whenever you like:' },
          {
            type: 'ul',
            items: [
              '**Members:** member ID, name, phone, status, gender, age, area, pending dues, plan, category, join date and plan start and end dates. Filter by status and joining date first.',
              '**Payments:** membership payments, inventory sales and due payments, for the period and payment mode you choose.',
              '**Attendance:** the full log with sessions, check-in and check-out times and duration.',
              '**Reports:** a PDF summary of members, collection, dues and expiries.',
            ],
          },
          { type: 'p', text: 'You can also delete your gym\'s data from Account settings.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'What file types can I import?' },
          { type: 'p', text: 'CSV, XLSX and XLS files, up to 10 MB, with the column headings in the first row. If your workbook has several sheets or many unused rows, trim it first, because a spreadsheet that is too large is refused with a message asking you to remove them.' },
          { type: 'h3', text: 'What if my columns are named differently?' },
          { type: 'p', text: 'GymFlow guesses which column is the name, phone, plan and start date, and you can correct any guess on the mapping step. Only name and phone are essential. A missing plan is treated as monthly, and a missing start date as today.' },
          { type: 'h3', text: 'Will importing send WhatsApp messages to my members?' },
          { type: 'p', text: 'Nobody gets a welcome message from an import. Members whose plan ends soon, or ended in the last two months, are reminded on WhatsApp straight away, so check the dates in the preview before you confirm. Nothing is saved, and so nothing is sent, until you confirm the import.' },
          { type: 'h3', text: 'Can I move to GymFlow in stages?' },
          { type: 'p', text: 'Yes. One import saves up to 500 members, so split a longer list into parts. Member numbers from your file are kept where they can be, and any clash is flagged and given a new number, so no two members share an ID.' },
        ],
      },
      {
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners switching from a register, an Excel sheet or another app who do not want to type hundreds of members again. Once imported, your members appear in [member management](/members), ready for renewals, dues and reminders.' },
        ],
      },
    ],
  },
  {
    slug: 'pricing',
    ogImage: '/og/pricing.jpg',
    ogAlt: 'GymFlow card: Pricing, two plans with every feature and a 14-day free trial.',
    title: `Gym Software Pricing in India: ${formatINR(MONTHLY.price)} a Month — GymFlow`,
    description: `GymFlow costs ${formatINR(MONTHLY.price)} a month or ${formatINR(YEARLY.price)} a year. Every feature is in every plan, with unlimited members and WhatsApp messages and a 14-day free trial.`,
    h1: 'Gym management software pricing',
    eyebrow: 'Pricing',
    intro: `GymFlow costs ${formatINR(MONTHLY.price)} a month or ${formatINR(YEARLY.price)} a year. Every feature is in both plans, members and WhatsApp messages are unlimited, and no GST is added: the price you see is the price you pay.`,
    breadcrumb: 'Pricing',
    cardTitle: 'Pricing',
    cardText: `Two plans, monthly or yearly, with every feature in both. Start with a 14-day free trial, no credit card.`,
    icon: 'tag',
    group: 'Plans',
    topLevel: true,
    related: ['members', 'whatsapp', 'import-export'],
    sections: [
      {
        heading: 'Two plans, one set of features',
        blocks: [
          { type: 'h3', text: MONTHLY.label },
          { type: 'p', text: `${formatINR(MONTHLY.price)} a month, billed monthly.` },
          { type: 'h3', text: YEARLY.label },
          { type: 'p', text: `${formatINR(YEARLY.price)} a year, billed once a year. That works out to ${formatINR(perMonth(YEARLY))} a month, about ${savingPercent(YEARLY)}% less than twelve monthly payments.` },
          { type: 'note', text: 'No GST is added. The price you see is the price you pay.' },
          { type: 'p', text: 'There is no per-member charge, no per-message charge and no setup fee. You try everything free for 14 days, then choose a paid plan or the free forever plan for up to 50 members.' },
        ],
      },
      {
        heading: 'Every feature in every plan',
        blocks: [
          { type: 'p', text: 'Nothing is held back for a higher plan. Both plans include all of this:' },
          {
            type: 'ul',
            items: [
              '[Member management](/members): records, plans, expiry dates, renewals, search and filters.',
              '[Fees and dues](/fees-and-dues): cash, UPI and card payments, part payments and pending dues.',
              '[Attendance tracking](/attendance): a front-desk check-in kiosk and a full log.',
              '[Member app and workouts](/member-app): a digital card, streaks, leaderboards and rewards, with [workout programs](/workout-programs) you assign.',
              '[WhatsApp reminders](/whatsapp): unlimited automatic messages for welcome, renewal, expiry, dues and birthdays.',
              '[Reports and analytics](/reports): five plain-English reports and a PDF download.',
              '[Import and export](/import-export): bring your members in from Excel or CSV and export your data any time.',
              'Direct support from the person who builds GymFlow.',
            ],
          },
        ],
      },
      {
        heading: 'The 14-day free trial',
        blocks: [
          { type: 'p', text: 'Create your gym account and use every feature for 14 days. No credit card is needed to start, and you can cancel anytime. A banner in the app counts down the days left in your trial. Load your real member list with the [Excel import](/import-export) during the trial, so you judge GymFlow on your own gym and not on sample data.' },
        ],
      },
      {
        heading: 'How activation works',
        blocks: [
          {
            type: 'ol',
            items: [
              'Choose Monthly or Yearly on the subscription page in the app. It shows a UPI QR code and UPI ID for the exact amount, which you can scan with any UPI app such as GPay, PhonePe, Paytm or BHIM.',
              'Complete the payment, then take a screenshot of it.',
              'Upload the screenshot (or a PDF) on the same page.',
              'We verify the payment, which usually takes a few hours, and switch your account on.',
            ],
          },
          { type: 'p', text: 'GymFlow does not store a card and nothing is charged automatically. You pay when you decide to, so there is no surprise renewal.' },
        ],
      },
      {
        heading: 'After the trial ends',
        blocks: [
          { type: 'p', text: 'When your trial ends, GymFlow takes you to the subscription page each time you open the owner console, until a plan is activated. Pay and upload your screenshot as above, and you carry on with the same members and records. Before a paid plan ends, the app warns you how many days are left, so you can pay again in good time.' },
        ],
      },
      {
        heading: 'Cancellation',
        blocks: [
          { type: 'p', text: 'Because you pay by hand, there is no subscription to cancel: GymFlow never renews on its own. If you do not pay again, access ends when your plan does. While your account is active you can export your members, payments and attendance to Excel, and delete your gym\'s data from Account settings.' },
        ],
      },
      {
        heading: 'Support',
        blocks: [
          { type: 'p', text: 'Direct support from the person who builds GymFlow. We reply within 24 hours, in English and Tamil. Write to [support@gymflow.sbs](mailto:support@gymflow.sbs) or message +91 93848 86895 on WhatsApp.' },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Is there a free plan?' },
          { type: 'p', text: 'Yes. There is a free forever plan for up to 50 members, available after the free 14-day trial. It does not include the member app, and WhatsApp messages on it need a paid add-on. The trial has every feature and needs no credit card. For unlimited members choose the monthly or the yearly plan.' },
          { type: 'h3', text: 'Do you charge per member or per WhatsApp message?' },
          { type: 'p', text: 'No. Members and WhatsApp messages are unlimited on both paid plans, and the price does not change as your gym grows.' },
          { type: 'h3', text: 'Is GST added to the price?' },
          { type: 'p', text: 'No GST is added. The price you see is the price you pay.' },
          { type: 'h3', text: 'Do I need a credit card to start?' },
          { type: 'p', text: 'No. You can start the trial and use every feature without entering any card details.' },
        ],
      },
    ],
  },
  {
    slug: 'gym-software-vs-excel',
    ogImage: '/og/gym-software-vs-excel.jpg',
    ogAlt: 'GymFlow card: Gym software versus Excel, a guide for gym owners.',
    title: 'Gym Software vs Excel: Which Is Right for Your Gym?',
    description: 'An honest guide for Indian gym owners: when a register or Excel sheet is enough, where it breaks down, and what gym software like GymFlow changes.',
    h1: 'Gym software or Excel: how to choose for your gym',
    eyebrow: 'Guide',
    intro: 'A notebook or an Excel sheet is enough for a very small gym. Gym software such as GymFlow earns its place once chasing renewals and dues takes more of your week than running the gym.',
    breadcrumb: 'Gym software vs Excel',
    cardTitle: 'Gym software vs Excel',
    cardText: 'When a register or spreadsheet is enough, where it breaks down and what gym software changes.',
    icon: 'book',
    group: 'Guides',
    topLevel: true,
    related: ['import-export', 'fees-and-dues', 'whatsapp'],
    sections: [
      {
        heading: 'When a notebook or Excel is enough',
        blocks: [
          { type: 'p', text: 'Excel is free, you already know it, and for some gyms it is the right tool. It is probably enough if:' },
          {
            type: 'ul',
            items: [
              'You have few members, and you know each of them and when they renew.',
              'One person does all the work and is at the desk every day.',
              'Members pay the full fee in one go, so you rarely track part payments.',
              'You are happy to phone or message members yourself, and you do not need reports.',
            ],
          },
          { type: 'p', text: 'If that describes your gym, a clean sheet with one row per member and a column for the expiry date will serve you well. Keep it tidy and back it up.' },
        ],
      },
      {
        heading: 'Where a register or sheet starts to hurt',
        blocks: [
          {
            type: 'ul',
            items: [
              '**Renewals:** a sheet does not tell you who expires this week unless you sort it and check every day. A missed renewal is money you never see.',
              '**Dues:** part payments and balances end up spread across rows, notes and memory, so "has he paid?" becomes an argument.',
              '**Reminders:** every message to every member is typed by you, on your own time.',
              '**Attendance:** a paper register records who came, but does not show who has quietly stopped coming.',
              '**Many hands:** when a trainer and a front-desk person both edit one file, versions drift and entries get overwritten.',
              '**Messy phone numbers:** numbers typed with spaces, +91 or a leading 0 break any attempt to message members in bulk.',
            ],
          },
        ],
      },
      {
        heading: 'What gym software changes',
        blocks: [
          { type: 'p', text: 'Here is what GymFlow does for each of those problems. Other gym software may differ.' },
          {
            type: 'ul',
            items: [
              'Each member is marked **Active**, **Expiring** (7 days or fewer left) or **Expired**, so you see who to call. See [member management](/members).',
              'Part payments stay on the member as a pending due until cleared, with a list of who owes what. See [fees and dues](/fees-and-dues).',
              'Welcome, renewal, expiry, due and birthday messages go out on WhatsApp by themselves. See [WhatsApp reminders](/whatsapp).',
              'Members check in with their ID at a front-desk kiosk, and a report lists those who have not come for 7 days or more. See [attendance tracking](/attendance).',
              'Phone numbers are tidied into 10-digit mobile numbers when you import a list.',
            ],
          },
        ],
      },
      {
        heading: 'What software does not fix',
        blocks: [
          {
            type: 'ul',
            items: [
              'You still have to record payments and check-ins when they happen. Software is only as good as the records you keep.',
              'GymFlow records payments but does not collect them. It is not a payment gateway and it does not create GST invoices.',
              'It runs in a browser. It has no door access or biometric devices, and it is built for one gym, not a chain of branches.',
              'It costs money, where Excel does not. See [pricing](/pricing).',
            ],
          },
        ],
      },
      {
        heading: 'A simple way to decide',
        blocks: [
          { type: 'p', text: 'Answer these honestly:' },
          {
            type: 'ol',
            items: [
              'Did a member use the gym after their plan ended, because nobody noticed it had expired?',
              'Do you spend hours each week phoning or messaging members about fees or renewals?',
              'Do you ever argue or guess about how much a member still owes?',
              'Would you struggle to say how much your gym collected last month, or who stopped coming?',
            ],
          },
          { type: 'p', text: 'If two or more are a yes, try software. If all four are a no, your sheet is working, and there is no need to change.' },
        ],
      },
      {
        heading: 'Moving from Excel to GymFlow',
        blocks: [
          { type: 'p', text: `You do not need to retype your list. GymFlow reads Excel and CSV files, lets you match your columns and plans, and shows a preview before anything is saved. One import takes up to 500 members. See [import and export](/import-export) for the steps. The free 14-day trial needs no credit card, so you can load your own list and judge it on your real gym. After that GymFlow costs ${formatINR(MONTHLY.price)} a month or ${formatINR(YEARLY.price)} a year. See [pricing](/pricing).` },
        ],
      },
      {
        heading: 'Common questions',
        blocks: [
          { type: 'h3', text: 'Can I keep my Excel sheet as well?' },
          { type: 'p', text: 'Yes. Keep your old sheet as a backup. You can also export your members, payments and attendance to Excel from GymFlow whenever you like, so your records are never locked in.' },
          { type: 'h3', text: 'What if I decide to stop using GymFlow?' },
          { type: 'p', text: 'Export your data to Excel while your account is active, and keep that file. Plans are paid by hand and never renew on their own, so nothing is charged after you stop.' },
          { type: 'h3', text: 'Will my members need to learn anything new?' },
          { type: 'p', text: 'Not to be counted. At the desk, a member only types their member ID. The member app is optional, and it opens from a link sent on WhatsApp with no app store download.' },
        ],
      },
    ],
  },
]

export const FEATURE_SLUGS = FEATURE_PAGES.map(page => page.slug)

export function getFeaturePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find(page => page.slug === slug)
}

/** The eight feature pages the hub lists, in hub order (not the hub itself, pricing or the guides). */
export const FEATURE_CARDS = FEATURE_PAGES.filter(page => page.slug !== 'features' && !page.topLevel)

export type InlineNode =
  | { kind: 'text'; text: string }
  | { kind: 'strong'; text: string }
  | { kind: 'link'; text: string; href: string }

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)]+)\)/g

export function parseInline(text: string): InlineNode[] {
  const nodes: InlineNode[] = []
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    if (match.index > last) nodes.push({ kind: 'text', text: text.slice(last, match.index) })
    if (match[1] !== undefined) nodes.push({ kind: 'strong', text: match[1] })
    else nodes.push({ kind: 'link', text: match[2], href: match[3] })
    last = match.index + match[0].length
  }
  if (last < text.length) nodes.push({ kind: 'text', text: text.slice(last) })
  return nodes
}

/**
 * Stable anchor ids for a page's sections, one per section in order: the heading as a slug,
 * made unique within the page. The React renderer, the table of contents, the search index and
 * the no-JavaScript copy (vite.config.ts) all call this, so a link to /slug#id lands everywhere.
 */
export function sectionIds(page: FeaturePage): string[] {
  const seen = new Map<string, number>()
  return page.sections.map(section => {
    const base = section.heading.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'section'
    const count = (seen.get(base) ?? 0) + 1
    seen.set(base, count)
    return count === 1 ? base : `${base}-${count}`
  })
}

/** Sidebar and Previous/Next label: the card title, or "All features" for the hub. */
export function docLabel(page: FeaturePage): string {
  return page.slug === 'features' ? 'All features' : (page.cardTitle ?? page.breadcrumb)
}
