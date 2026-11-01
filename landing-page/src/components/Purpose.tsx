import { Section, SectionHead, Split } from './layout/Section';
import '../styles/facts.css';

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
    <Section id="why" labelledBy="why-title" className="pt-12 md:pt-12 overflow-clip!">
      <Split
        head={
          <div className="relative">
            <span aria-hidden className="outline-text why-word">
              WHY
            </span>
            <div className="relative">
              <SectionHead
                title={<h2 id="why-title" className="display-2 min-w-0 break-words">{'What GymFlow is here for'}</h2>}
                lead="Many independent gyms in India still run on notebooks, Excel sheets and WhatsApp chats. GymFlow puts members, fees, attendance and reminders in one place that works on a phone."
              />
            </div>
          </div>
        }
      >
        <ul className="why-list">
          {ITEMS.map(item => (
            <li key={item.title} className="why-row">
              <h3 className="text-[20px] font-bold leading-snug text-foreground md:text-[22px]">{item.title}</h3>
              <p className="mt-2 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">{item.desc}</p>
            </li>
          ))}
        </ul>
      </Split>
    </Section>
  );
}
