/* Single source of truth for the feature pages (/features and the seven pages under it).

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

export const SITE_ORIGIN = 'https://www.gymflow.sbs'

export type FeatureIcon = 'users' | 'rupee' | 'calendar-check' | 'smartphone' | 'message' | 'chart' | 'upload'

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
export const FEATURE_DATE_MODIFIED = '2026-10-20'

export const FEATURE_PAGES: readonly FeaturePage[] = [
  {
    slug: 'features',
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
          { type: 'p', text: 'GymFlow has no add-on modules and no features held back for a higher plan. Whichever plan you choose, you get everything on this page. Members and WhatsApp messages are unlimited, and you can try all of it free for 14 days without a credit card. [See pricing](/#pricing).' },
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
    title: 'Gym Member Management Software for India — GymFlow',
    description: 'Gym member management software for Indian gyms: member records, plans, expiry dates, renewals, search and filters, with a WhatsApp welcome. 14-day free trial.',
    h1: 'Gym member management software for India',
    eyebrow: 'Member management',
    intro: 'GymFlow keeps every member, plan, expiry date and payment in one place, so a question like "who is expiring this week?" takes seconds instead of a search through notebooks and spreadsheets.',
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners of independent gyms and fitness studios who still keep members in a register or a spreadsheet and want to stop chasing renewals by memory. Nothing to install: it runs in a web browser on a phone or a computer. If you already have a list, [import it from Excel or CSV](/import-export) instead of typing it again.' },
        ],
      },
    ],
  },
  {
    slug: 'fees-and-dues',
    title: 'Gym Fee and Dues Management Software for India — GymFlow',
    description: 'Track gym fees and pending dues in one place: record cash, UPI and card payments, collect part payments, and remind members on WhatsApp. 14-day free trial.',
    h1: 'Gym fee and dues management software',
    eyebrow: 'Fees, payments and dues',
    intro: 'Know who has paid, who owes you and how much, without opening a notebook. GymFlow records every fee by cash, UPI or card, keeps a running list of pending dues and reminds members on WhatsApp until they pay.',
    breadcrumb: 'Fees and dues',
    cardTitle: 'Fees, payments and dues',
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gym owners who collect fees in cash and UPI, let regulars pay part now and part later, and today keep track of balances in a notebook or in their head. Every payment is recorded against the member, so the question "has he paid?" always has an answer. To see the totals across months, open [reports and analytics](/reports).' },
        ],
      },
    ],
  },
  {
    slug: 'attendance',
    title: 'Gym Attendance Tracking Software and Kiosk — GymFlow',
    description: 'Gym attendance software with a front-desk check-in kiosk: members enter their ID, you get check-in and check-out times, a searchable log and Excel export.',
    h1: 'Gym attendance tracking software with a check-in kiosk',
    eyebrow: 'Attendance tracking',
    intro: 'Open the attendance page on a tablet or phone at your front desk. Members type their member ID, and GymFlow records the visit, the session and how long they stayed.',
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gyms that want to know who actually turns up, to spot members who have stopped coming before they quietly lapse, and to give busy front-desk staff a one-field screen instead of a register. Pair it with [member management](/members) so every ID maps to a plan and expiry date.' },
        ],
      },
    ],
  },
  {
    slug: 'member-app',
    title: 'Gym Member App with Workouts and Leaderboards — GymFlow',
    description: 'Give gym members their own app: digital membership card, assigned workout programs, attendance streaks, leaderboards and rewards. No app store download.',
    h1: 'Gym member app with workouts, digital card and leaderboards',
    eyebrow: 'Member app and workouts',
    intro: 'Every member can have their own app on their phone. It opens from a link you send on WhatsApp and installs to the home screen, so there is no app store download.',
    breadcrumb: 'Member app and workouts',
    cardTitle: 'Member app and workouts',
    cardText: 'A member app with a digital card, workout programs, streaks, leaderboards and rewards.',
    icon: 'smartphone',
    related: ['attendance', 'whatsapp', 'members'],
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
          { type: 'p', text: 'On the Programs page you build a workout plan: name, summary, number of weeks, days per week, difficulty, goal and equipment. Then add exercises for each day of the week with sets, reps, weight and rest. Assign the plan to the members it suits. They see it in their app, tap **Start Workout**, and are walked through it set by set. Days without exercises show as rest days.' },
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Gym owners who want members to feel looked after between visits: a clear card to show, a plan to follow and a reason to come back tomorrow. It sits on top of your [attendance records](/attendance), so members earn streaks just by checking in at the kiosk.' },
        ],
      },
    ],
  },
  {
    slug: 'whatsapp',
    title: 'WhatsApp Reminders for Gyms, Sent Automatically — GymFlow',
    description: 'Automatic WhatsApp messages for your gym: welcome, renewal, expiry, expired, payment due and birthday reminders with no per-message charge. 14-day free trial.',
    h1: 'WhatsApp reminders for gyms, sent automatically',
    eyebrow: 'WhatsApp reminders',
    intro: 'Members forget to renew and forget what they owe. GymFlow sends the right WhatsApp message at the right time, so you do not have to remember to ask.',
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
        heading: 'Good to know',
        blocks: [
          {
            type: 'ul',
            items: [
              'Messages go out through the official WhatsApp Business Platform using message templates approved by Meta. The wording is fixed by those templates, so owners cannot edit the text.',
              'WhatsApp messages are unlimited on every plan, with no per-message charge.',
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
    title: 'Gym Reports and Analytics Software for Owners — GymFlow',
    description: 'Gym reports in plain English: member growth, monthly collection, pending dues, plans ending soon and members who stopped coming. Download a PDF. Free trial.',
    h1: 'Gym reports and analytics software for owners',
    eyebrow: 'Reports and analytics',
    intro: 'One page answers five questions: who are my members, how much money came in, who owes me, who is about to leave and who has stopped coming. Each answer starts with a sentence you can read in a few seconds.',
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners who want to run the gym by facts rather than feel. Use it at the end of the week to decide who to call, and at the start of the month to see how the last one went. The reports are only as complete as the records behind them, so they work best with [attendance](/attendance) and [payments](/fees-and-dues) recorded as they happen.' },
        ],
      },
    ],
  },
  {
    slug: 'import-export',
    title: 'Import Gym Members from Excel or CSV, Export Data — GymFlow',
    description: 'Move your gym from Excel or CSV to GymFlow: map columns and plans, preview before saving, then export members, payments and attendance to Excel anytime.',
    h1: 'Import gym members from Excel or CSV, and export your data',
    eyebrow: 'Excel and CSV import and export',
    intro: 'Already have your members in a spreadsheet? Upload the file and GymFlow matches your columns, plans and phone numbers. You see a preview first, and nothing is saved until you confirm.',
    breadcrumb: 'Import and export',
    cardTitle: 'Excel and CSV import and export',
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
        heading: 'Limits to know about',
        blocks: [
          {
            type: 'ul',
            items: [
              'One import saves up to 500 members. For a longer list, split the file and import it in parts.',
              'Imported members whose plan is ending soon, or ended in the last two months, are reminded on WhatsApp straight away. Nobody gets a welcome message from an import. See [WhatsApp reminders](/whatsapp).',
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
        heading: 'Who it is for',
        blocks: [
          { type: 'p', text: 'Owners switching from a register, an Excel sheet or another app who do not want to type hundreds of members again. Once imported, your members appear in [member management](/members), ready for renewals, dues and reminders.' },
        ],
      },
    ],
  },
]

export const FEATURE_SLUGS = FEATURE_PAGES.map(page => page.slug)

export function getFeaturePage(slug: string): FeaturePage | undefined {
  return FEATURE_PAGES.find(page => page.slug === slug)
}

/** The seven pages the hub lists, in hub order (everything except the hub itself). */
export const FEATURE_CARDS = FEATURE_PAGES.filter(page => page.slug !== 'features')

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
