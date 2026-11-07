import { Component, lazy, Suspense, type ReactNode } from 'react';
import { DashboardMock } from './dashboard/DashboardMock';
import { MemberAppCard } from './MemberAppCard';
import { useMediaQuery } from '../lib/useMediaQuery';
import { FREE_MEMBER_LIMIT } from '../data/plans';
import '../styles/home.css';

const APP_URL = 'https://app.gymflow.sbs';

/* The animated background is a WebGL shader (three.js), so it loads after the headline has painted and never
   blocks it. Brand blues only. A device without WebGL makes it throw while mounting; this boundary then drops
   the background instead of letting the error take the whole page down. */
const ColorBends = lazy(() => import('./ColorBends'));
const BEND_COLORS = ['#2563eb', '#38bdf8', '#93c5fd'];

class BackdropBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * The hero is alone on the first screen: the claim, one action pair, one hard fact (the free plan's
 * member limit) and the product itself as live HTML, cut by the fold under a fade. No entrance
 * animation: the headline is the largest paint and is there on the first frame. The owner console is
 * shown from tablet up; on a phone it would be too small to read, so the member app Home takes its place.
 */
export function Hero() {
  const wide = useMediaQuery('(min-width: 768px)');
  const still = useMediaQuery('(prefers-reduced-motion: reduce)');

  return (
    <section aria-labelledby="hero-title" className="hero">
      <div aria-hidden className="hero__bg">
        <BackdropBoundary>
          <Suspense fallback={null}>
            <ColorBends
              colors={BEND_COLORS}
              rotation={90}
              speed={still ? 0 : 0.2}
              scale={1}
              frequency={1}
              warpStrength={1}
              mouseInfluence={0}
              parallax={0}
              noise={0.1}
              iterations={1}
              intensity={1.2}
              bandWidth={6}
              transparent
            />
          </Suspense>
        </BackdropBoundary>
      </div>
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
          {wide ? (
            <div className="hero__frame">
              <p className="sr-only">
                The GymFlow owner console: active, expiring and expired members, today&apos;s collection and total
                dues, with a sidebar for members, payments, dues, attendance, inventory and programs.
              </p>
              <DashboardMock />
            </div>
          ) : (
            <div className="hero__frame">
              <MemberAppCard compact />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
