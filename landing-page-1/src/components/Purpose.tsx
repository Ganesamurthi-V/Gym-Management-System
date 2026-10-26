import { Dumbbell, Smartphone, Users } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { ShinyText } from './ShinyText';

/* Every line is a product fact, the same wording as the feature pages (src/data/featurePages.ts).
   No customer numbers or outcomes: there are none to claim yet. */
const ITEMS = [
  {
    icon: Dumbbell,
    title: 'For independent gyms',
    desc: 'Built for one gym and its owner, not for chains. Free for up to 50 members, and no per-member charge on the paid plans.',
  },
  {
    icon: Smartphone,
    title: 'For phones, cash and UPI',
    desc: 'Runs in a browser on a phone or a computer, with nothing to install. Records cash, UPI and card payments in rupees.',
  },
  {
    icon: Users,
    title: 'For your members too',
    desc: 'On the paid plans, each member can open their own app from a WhatsApp link, with no app store download.',
  },
] as const;

export function Purpose() {
  const scope = useReveal<HTMLElement>({ perElement: true, y: 28, duration: 0.7, start: 'top 90%' });

  return (
    <section id="why" ref={scope} aria-labelledby="why-title" className="scroll-mt-24 px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <span className="reveal eyebrow">Why GymFlow exists</span>
          <h2 id="why-title" className="reveal display-2 mt-4 text-balance">
            {'What GymFlow is '}
            <em className="display-accent">
              <ShinyText text="here for" speed={2.8} spread={120} />
            </em>
          </h2>
          <p className="reveal lead mt-5 max-w-[600px]">
            Many independent gyms in India still run on notebooks, Excel sheets and WhatsApp chats.
            GymFlow puts members, fees, attendance and reminders in one place that works on a phone.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 md:grid-cols-3">
          {ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="reveal card flex flex-col p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                  <Icon aria-hidden className="h-5 w-5 text-accent-text" />
                </span>
                <h3 className="mt-5 text-[15.5px] font-medium tracking-tight text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{item.desc}</p>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
