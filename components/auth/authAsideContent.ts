import {
  Dumbbell,
  Flame,
  LayoutDashboard,
  MessageCircle,
  QrCode,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type { AuthAsideProps } from './AuthAside'
import type { AppRole } from '@/lib/auth/roles'

/**
 * Copy for the left column of the split /auth pages, in one place because two pages show
 * it: sign-in and create-account are the same funnel, and a visitor moves between them
 * with one click. Defined per page they would drift, which is precisely what happened to
 * the dark panel this replaces — three hand-maintained copies, two of which had fallen
 * behind.
 *
 * The wording is carried over from that panel rather than rewritten, so the claims are
 * still the ones the marketing site makes. The owner headline is the landing page's own,
 * verbatim: someone arriving from gymflow's front page should land on the same sentence.
 * The trial terms match Hero, Pricing, Navbar and FAQ on the landing site.
 *
 * Keyed by role because the two tabs are two different products. An owner is buying gym
 * software; a member was handed an account by their gym and cannot buy anything. Showing
 * the owner pitch to a member would sell them something they cannot act on, and the trial
 * line would be plainly misleading — which is why the member entry has no note.
 */
export const AUTH_ASIDE: Record<AppRole, AuthAsideProps> = {
  owner: {
    heading: 'Gym management, made effortless.',
    sub: 'Members, payments, attendance and dues in one place — without the notebooks, the spreadsheets and the renewals that quietly slip past.',
    features: [
      {
        icon: Users,
        label: 'Member management',
        desc: 'Track memberships, attendance and renewals without chasing paperwork.',
      },
      {
        icon: LayoutDashboard,
        label: 'Smart dashboard',
        desc: 'Collections, dues and active members at a glance, updated as your day runs.',
      },
      {
        icon: MessageCircle,
        label: 'WhatsApp reminders',
        desc: 'Renewal and dues follow-ups go out on their own, where members already read.',
      },
      {
        icon: ShieldCheck,
        label: 'Fast and secure',
        desc: 'Your data stays encrypted and reachable from any device, anywhere.',
      },
    ],
    note: '14-day free trial · No credit card required',
  },
  member: {
    heading: 'Your gym, in your pocket.',
    sub: 'Check in, follow the programme your trainer assigned, and watch your streak build.',
    features: [
      {
        icon: QrCode,
        label: 'Digital membership card',
        desc: 'Check in fast and see your plan status at a glance.',
      },
      {
        icon: Dumbbell,
        label: 'Workouts and progress',
        desc: 'Follow assigned programmes and track every session you finish.',
      },
      {
        icon: Flame,
        label: 'Streaks and rewards',
        desc: 'Earn XP and unlock achievements as you keep showing up.',
      },
    ],
  },
}
