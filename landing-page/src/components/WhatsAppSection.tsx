import { useEffect, useState } from 'react';
import { WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';
import { Section } from './layout/Section';

/* How long each sample message stays on the phone before the next one takes its place. */
const CYCLE_MS = 3000;

/* The one contrasting ground on the page (the graphite band): three message types on the left, one phone on the
   right. The phone cycles through the same three messages by itself every 3 seconds, and the matching item on the
   left lights up. The phone is a fixed height (see WhatsAppThread), so a taller message never resizes it. A
   visitor who asks for reduced motion gets no cycling: the first message stays, and the items still switch it
   when clicked. */
export function WhatsAppSection() {
  const [index, setIndex] = useState(0);
  const active = MESSAGE_TYPES[index];

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // A new timer starts whenever the message changes, so clicking an item gives it a full 3 seconds too.
    const timer = window.setTimeout(() => setIndex(i => (i + 1) % MESSAGE_TYPES.length), CYCLE_MS);
    return () => window.clearTimeout(timer);
  }, [index]);

  return (
    <Section id="whatsapp" labelledBy="whatsapp-title" tone="ink">
      <div className="sec-head">
        <div className="wa-title">
          <img src="/whatsapp-icon.webp" alt="" aria-hidden width={120} height={120} className="wa-logo" />
          <h2 id="whatsapp-title" className="h2">
            <span className="block">WhatsApp reminders</span>{' '}
            <span className="block">that send automatically</span>
          </h2>
        </div>
        <p className="lead wa-lead">Welcome, expiry and payment messages go out on their own, with no per-message charge on paid plans.</p>
      </div>

      <div className="wa-stage">
        <div className="wa-items">
          {MESSAGE_TYPES.map((type, i) => (
            <button key={type.id} type="button" aria-pressed={i === index} onClick={() => setIndex(i)} className="wa-item">
              <span aria-hidden className="wa-item__icon">
                <type.icon className="size-5" strokeWidth={1.75} />
              </span>
              <span>
                <span className="wa-item__title">{type.title}</span>
                <span className="wa-item__text">{type.desc}</span>
              </span>
            </button>
          ))}

          <p className="wa-items__more">
            Checked once a day, about 9 AM India time.{' '}
            <a href="/whatsapp" className="link">
              <span>How WhatsApp reminders work</span>
            </a>
          </p>
        </div>

        <div className="wa-phone">
          <WhatsAppThread messages={[active.message]} label={active.label} />
        </div>
      </div>
    </Section>
  );
}
