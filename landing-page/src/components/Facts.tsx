import '../styles/home.css';

/** Product facts only (no customer counts or ratings until there are real ones to show). */
const HERO_FACTS = [
  { value: '₹0', label: 'Per-message charge for WhatsApp reminders' },
  { value: '100%', label: 'Automated renewal reminders on WhatsApp' },
  { value: '1 upload', label: 'Move all your members in from Excel' },
  { value: '0', label: 'Paper registers or notebooks needed' },
] as const;

/** A short strip of product facts between the hero and the film; its own section, not part of the hero. */
export function Facts() {
  return (
    <section aria-label="GymFlow at a glance" className="facts">
      <div className="wrap">
        <dl className="hero__stats">
          {HERO_FACTS.map((f) => (
            <div key={f.label} className="hero__stat">
              <dt>{f.value}</dt>
              <dd>{f.label}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
