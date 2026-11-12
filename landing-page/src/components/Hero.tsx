import { DashboardMock } from './dashboard/DashboardMock';
import { FREE_MEMBER_LIMIT } from '../data/plans';
import '../styles/home.css';

const APP_URL = 'https://app.gymflow.sbs';

/**
 * The hero is alone on the first screen: the claim, one action pair, one hard fact (the free plan's
 * member limit) and the product itself as live HTML, cut by the fold under a fade. No entrance
 * animation: the headline is the largest paint and is there on the first frame. The owner console is
 * shown from tablet up; on a phone it would be too small to read, so the member app Home takes its place.
 */
export function Hero() {
  return (
    <section aria-labelledby="hero-title" className="hero">
      <div className="wrap hero__wrap">
        <div className="hero__head">
          <h1 id="hero-title" className="hero__h1">
            Gym management software made effortless
          </h1>

          <div className="hero__side">
            <p className="hero__lead">Members, fees, attendance and WhatsApp reminders in one simple app.</p>
            <div className="hero__actions">
              <a href={APP_URL} className="btn btn-primary">
                Start free trial
              </a>
              <a href="/pricing" className="btn btn-outline">
                See pricing
              </a>
            </div>
            <p className="hero__terms">
              <span>14-day free trial</span>
              <span>No credit card</span>
              <span>Free for up to {FREE_MEMBER_LIMIT} members</span>
            </p>
          </div>
        </div>

        <div className="hero__product">
          <div className="hero__frame">
            <p className="sr-only">
              The GymFlow owner console: active, expiring and expired members, today&apos;s collection and total
              dues, with a sidebar for members, payments, dues, attendance, inventory and programs.
            </p>
            <DashboardMock />
          </div>
        </div>
      </div>
    </section>
  );
}
