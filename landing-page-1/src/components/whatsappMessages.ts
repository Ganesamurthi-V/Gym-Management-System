import { BellRing, UserPlus, Wallet } from 'lucide-react';
import type { ThreadMessage } from './WhatsAppThread';

/* Lives apart from WhatsAppSection.tsx so the feature pages can show the same messages without a
   component file exporting plain values (which would break Fast Refresh). */
/* One entry per tab. `message` is the rendered artefact shown in the phone;
   `desc` serves the text beside the phone; below md the phone is hidden and the
   active tab shows just the message bubble on a chat surface instead. Bodies use the live templates'
   asterisk-bold syntax so what the phone shows is what a member receives. */
export const MESSAGE_TYPES = [
  {
    id: 'welcome',
    icon: UserPlus,
    title: 'Welcome',
    desc: 'Sent the moment a member joins, with their plan and expiry.',
    when: 'On joining',
    label: 'A new member’s phone showing the automated welcome message: a branded confirmation that their annual membership is active, with member ID, plan and start date.',
    message: {
      banner: true,
      time: '11:50',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

Your membership has been successfully *activated*.

Member ID: *GF0086*
Membership Plan: *Annual (12 Months)*
Start Date: *07 Sep 2026*

Thank you for choosing *Fit zone gym*. We're excited to be part of your fitness journey.❤️`,
    } satisfies ThreadMessage,
  },
  {
    id: 'expired',
    icon: BellRing,
    title: 'Expired',
    desc: 'Tells a member their plan has lapsed and asks them to renew.',
    when: 'On expiry',
    label: 'A member’s phone showing an automated WhatsApp message from their gym saying their membership has expired, with member ID and expiry date, asking them to renew.',
    message: {
      banner: true,
      time: '09:39',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

Your membership with *Vivi gym* has expired.

 Member ID: *GF001*
Expired On: *26/07/2026*

To continue uninterrupted access to the gym, please *renew* your membership at your earliest convenience.❤️`,
    } satisfies ThreadMessage,
  },
  {
    id: 'payment',
    icon: Wallet,
    title: 'Payment due',
    desc: 'Nudges the members who still owe, without you asking twice.',
    when: 'Every 3 days',
    label: 'A member’s phone showing an automated WhatsApp payment due alert from their gym.',
    message: {
      banner: true,
      time: '09:40',
      footer: 'Powered by Gym Flow',
      body: `Hi Ganesh! 👋

This is a reminder that your membership payment is *due*.

Amount : *₹2000*

Please complete your payment before the due date to keep your membership active. ❤️`,
    } satisfies ThreadMessage,
  },
] as const;
