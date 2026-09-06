import { Check } from 'lucide-react';

/** How far the phone runs past the card's bottom edge, in px. */
const BLEED = 72;

/**
 * Member app bento card: centred copy with the phone below it, cropped by the
 * card's bottom edge.
 *
 * Spans both grid rows from md up, so it reads as a tall portrait column beside
 * the shorter cards — the proportion the phone composition needs. A wide card
 * would leave the phone stranded in empty blue.
 */
export function MemberAppCard() {
  return (
    <div className="reveal grid md:row-span-2">
      {/* overflow-hidden is load-bearing: it crops the phone against the card's
          rounded bottom edge so the mock bleeds off rather than floating. No
          bottom padding, so the phone well runs to the card's edge. */}
      <article className="card-accent relative flex flex-col items-center overflow-hidden px-6 pt-8 text-center">
        <h3 className="text-[26px] font-medium leading-[1.1] tracking-tight text-accent-ink">
          Your members get
          <br />
          their own app.
        </h3>

        <p className="mt-3.5 max-w-[300px] text-[13px] leading-relaxed text-accent-ink/80">
          Membership, attendance and a digital gym card on their own phone. Installs from a
          link, no app store.
        </p>

        {/* Phone well. The frame inside is sized BLEED taller than this box, so the
            crop stays constant however tall the grid makes the card — no fixed
            phone height to keep in sync with the row heights.

            The 3px of horizontal padding is not cosmetic: overflow-hidden clips
            both axes, and the side buttons sit 2.5px outside the frame. */}
        <div className="mt-7 h-[330px] w-[256px] overflow-hidden px-[3px] md:h-auto md:min-h-0 md:flex-1">
          <PhoneMock />
        </div>
      </article>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * CSS-built iPhone frame. Drawn rather than shipped as an image so it stays
 * crisp at any DPI and the screen inside can use live tokens.
 *
 * role="img" collapses the mock to a single label for assistive tech — without
 * it a screen reader reads illustrative member data as though it were page
 * content.
 */
function PhoneMock() {
  return (
    <div
      role="img"
      aria-label="The GymFlow member app running on a phone. The screen shows the member's membership as active with 24 days left, above their digital member card."
      className="relative"
      style={{ height: `calc(100% + ${BLEED}px)` }}
    >
      {/* Side buttons — small dark ticks against the card, purely decorative */}
      <span
        aria-hidden
        className="absolute -left-[2.5px] top-[88px] h-10 w-[3px] rounded-l-sm bg-[#0b0b0b]"
      />
      <span
        aria-hidden
        className="absolute -right-[2.5px] top-[110px] h-[60px] w-[3px] rounded-r-sm bg-[#0b0b0b]"
      />

      {/* Bezel. Screen radius is bezel radius minus the 10px band, which keeps
          the two roundings concentric. */}
      <div className="relative h-full rounded-[41px] bg-[#0b0b0b] p-[10px] shadow-[0_26px_50px_-22px_rgba(0,0,0,0.5)]">
        <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[31px] px-4 pt-12 text-left">
          <span
            aria-hidden
            className="absolute left-1/2 top-2.5 h-[21px] w-[80px] -translate-x-1/2 rounded-full bg-[#0b0b0b]"
          />

          <p className="text-[10.5px] font-medium text-[var(--dev-muted)]">
            Welcome back, Karthik
          </p>

          <p className="mt-2 text-[19px] font-semibold leading-[1.14] tracking-tight">
            Your membership
            <br />
            is active.
          </p>

          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--dev-muted)]">
            Quarterly plan, 24 days left.
          </p>

          {/* Digital member card. Grows to the bottom of the frame, so it always
              runs past the crop rather than leaving blank screen below it. The
              bottom padding parks the meta line just above the crop line, which
              is what makes the card read as continuing off-screen. */}
          <div
            className="mt-4 flex flex-1 flex-col rounded-2xl bg-card-primary p-4"
            style={{ paddingBottom: `${BLEED + 20}px` }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-mono text-[9px] uppercase tracking-wider text-accent-ink/80">
                  Member card
                </span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-accent-ink">
                  Karthik R.
                </span>
              </span>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-ink/15">
                <Check className="h-3.5 w-3.5 text-accent-ink" strokeWidth={3} />
              </span>
            </div>

            <p className="mt-auto font-mono text-[9px] uppercase tracking-wider text-accent-ink/80">
              GF · 2049 · Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
