import ScrollVelocity from './ui/ScrollVelocity';
import '../styles/ticker.css';

// The six phrases the owner's page has always run, verbatim, typed in capitals for the tape.
const POINTS = [
  'RENEWALS TRACKED',
  'DUES COLLECTED',
  'ATTENDANCE COUNTED',
  'REMINDERS SENT ON WHATSAPP',
  'REPORTS IN PLAIN ENGLISH',
  'BUILT FOR GYMS IN INDIA',
] as const;

/**
 * The blue tape between the facts and the problems: a skewed full-bleed strip of Anton capitals
 * that speeds up as the visitor scrolls (ScrollVelocity), pauses off-screen and stands still under
 * reduced motion. Decorative, so hidden from assistive tech: every phrase is a claim made elsewhere.
 */
export function Ticker() {
  const row = (
    <>
      {POINTS.map(text => (
        <span key={text} className="ticker-item">
          <span>{text}</span>
          <span aria-hidden className="ticker-mark" />
        </span>
      ))}
    </>
  );

  return (
    <div aria-hidden className="ticker-wrap">
      <div className="tape">
        <ScrollVelocity
          texts={[row]}
          velocity={40}
          numCopies={4}
          fontSize="clamp(28px, 3vw, 40px)"
          color="var(--accent-ink)"
        />
      </div>
    </div>
  );
}
