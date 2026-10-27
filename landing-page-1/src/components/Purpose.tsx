import { RuledList, Section, SectionHead, Split } from './layout/Section';

/* Every line is a product fact, the same wording as the feature pages (src/data/featurePages.ts).
   No customer numbers or outcomes: there are none to claim yet. */
const ITEMS = [
  {
    title: 'For independent gyms',
    desc: 'Built for one gym and its owner, not for chains. Free for up to 50 members, and no per-member charge on the paid plans.',
  },
  {
    title: 'For phones, cash and UPI',
    desc: 'Runs in a browser on a phone or a computer, with nothing to install. Records cash, UPI and card payments in rupees.',
  },
  {
    title: 'For your members too',
    desc: 'On the paid plans, each member can open their own app from a WhatsApp link, with no app store download.',
  },
] as const;

export function Purpose() {
  return (
    <Section id="why" labelledBy="why-title">
      <Split
        head={
          <SectionHead
            title={<h2 id="why-title" className="display-2 text-balance">{'What GymFlow is here for'}</h2>}
            lead="Many independent gyms in India still run on notebooks, Excel sheets and WhatsApp chats. GymFlow puts members, fees, attendance and reminders in one place that works on a phone."
          />
        }
      >
        <RuledList items={ITEMS.map(i => ({ title: i.title, text: i.desc }))} />
      </Split>
    </Section>
  );
}
