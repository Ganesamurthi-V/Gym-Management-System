import { HeroVideo } from './HeroVideo';
import { DashboardMock } from './dashboard/DashboardMock';
import { Magnet, SpotlightSurface, TiltFrame } from './fx';
import { HeroBackdrop } from './ascii/HeroBackdrop';
import { FREE_MEMBER_LIMIT } from '../data/plans';
import '../styles/hero.css';

const APP_URL = 'https://app.gymflow.sbs';

/**
 * Hero "Settled" (DESIGN.md): the headline, one lead sentence, two keycaps and a quiet terms line,
 * centred over the live ASCII field; then the product shown big, rising from the bottom of the first
 * screen. The headline does not animate: it is the largest paint and should be there on the first
 * frame. The owner console mock is the product shown (and is clickable). The film follows on a quiet band.
 */
export function Hero() {
  return (
    <>
      <section aria-labelledby="hero-title" className="hero-stage band-ink relative overflow-clip px-5 md:px-8">
        <div aria-hidden className="hero-field pointer-events-none absolute inset-x-0 top-0"><HeroBackdrop /></div>

        <div className="mx-auto w-full max-w-[1200px]">
          <h1 id="hero-title" className="display-xxl hero-h1">
            Gym management software made effortless
          </h1>

          <p className="hero-lead lead">Members, fees, attendance and WhatsApp reminders in one simple app.</p>

          <div className="hero-actions">
            <Magnet strength={0.12} className="sm:w-auto">
              <a href={APP_URL} className="btn btn-primary btn-lg w-full sm:w-auto">
                Start free trial
              </a>
            </Magnet>
            <a href="/pricing" className="btn btn-outline btn-lg">
              See pricing
            </a>
          </div>

          <p className="hero-terms">
            <span>14-day free trial</span>
            <span>No credit card</span>
            <span>Free for up to {FREE_MEMBER_LIMIT} members</span>
          </p>

          <div className="hero-demo">
            <div className="hero-float">
              <TiltFrame max={1.5}>
                <SpotlightSurface className="hero-dash">
                  <p className="sr-only">
                    Sample data. The GymFlow owner console: active, expiring and expired members, today&apos;s collection and total
                    dues, with a sidebar for members, payments, dues, attendance, inventory and programs.
                  </p>
                  <DashboardMock />
                </SpotlightSurface>
              </TiltFrame>
            </div>
            <p className="hero-foot text-[14px]">Sample data. Click around the sidebar to try it.</p>
          </div>
        </div>
      </section>

      <section aria-label="Product film" className="bg-subtle px-5 py-24 md:px-8 md:py-32">
        <div className="mx-auto max-w-[1200px]">
          <HeroVideo />
        </div>
      </section>
    </>
  );
}
