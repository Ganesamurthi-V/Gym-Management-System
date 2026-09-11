import { useEffect, useRef } from 'react';
import {
  ArrowRight,
  FileSpreadsheet,
  LayoutDashboard,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion, useReveal } from '../lib/useReveal';

gsap.registerPlugin(ScrollTrigger);

const APP_URL = 'https://app.gymflow.sbs';

/*
  Icons rather than the 01-04 numerals this used to show.

  The list is still an <ol>, so the ordering is carried semantically and the numbers
  were only ever repeating what the markup already said. Dropping them also drops
  the one hover state these rows had, which was decoration on something that is not
  interactive: there is no link on a step.
*/
const STEPS = [
  {
    icon: UserPlus,
    title: 'Sign up and onboard',
    desc: 'A six-step wizard walks you through your gym name, membership plans, pricing and WhatsApp details. It autosaves, so you can stop and come back.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Import your members',
    desc: 'Upload the CSV or Excel sheet you already keep. GymFlow matches your column headings to its own fields and shows you a preview, so you can fix anything odd before a single record is saved.',
  },
  {
    icon: LayoutDashboard,
    title: 'Run the day to day',
    desc: 'Mark attendance, record payments, and send WhatsApp reminders for dues — from one dashboard that works just as well on your phone.',
  },
  {
    icon: TrendingUp,
    title: 'Analyse and grow',
    desc: 'Monthly revenue charts, plan distribution, joining and expiry trends, and PDF reports you can download. Know exactly where the gym stands before the month closes.',
  },
] as const;

export function HowItWorks() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);

  /*
    Scroll-linked progress rail beside the steps.

    scaleY rather than the height the reference implementation animates. Height is
    a layout property, so driving it every frame reflows the list; scaleY is a
    compositor transform and the rail is a plain rectangle, so nothing is lost by
    scaling it. transformOrigin has to be set explicitly because GSAP defaults to
    the centre, which would grow the fill in both directions from the middle.

    The window is the reference site's, measured rather than guessed: the fill
    starts when the list's top passes 30% down the viewport and completes when its
    bottom reaches 70%. Sampled there, rect.top +200 gave 0.61% and -600 gave 100%,
    which is exactly (0.3vh - top) / (height - 0.4vh). ScrollTrigger expresses that
    directly, so the arithmetic stays out of here.

    Tracking the list rather than the whole section on purpose. The section also
    holds the sticky intro and 24 to 28 units of vertical padding, none of which the
    progress is about, and including them would leave the rail visibly unfinished
    once the last step had been read.

    The rail's own extent is measured rather than expressed in CSS, because it runs
    badge centre to badge centre and neither end is a percentage of anything. The
    last step's text drops well below its badge, so a rail sized to the list would
    overshoot into empty space; the reference site hides this by hard-coding
    calc(100% - 6rem), which is only correct for its own last item's height.

    Measured with offsetTop and offsetHeight, not getBoundingClientRect, and that is
    load-bearing. useReveal is declared above this hook so its effect runs first,
    which means at this moment every row is still sitting 28px low under its opening
    tween. Rects would capture that displacement and the rail would end up 28px out
    once the reveal settled. The offset properties come from layout and ignore
    transforms entirely.
  */
  useEffect(() => {
    const trackEl = track.current;
    const railEl = rail.current;
    const fillEl = fill.current;
    if (!trackEl || !railEl || !fillEl) return;

    /** Distance from `root`'s top to `el`'s, walking the offsetParent chain. */
    const offsetWithin = (el: HTMLElement, root: HTMLElement) => {
      let y = 0;
      let node: HTMLElement | null = el;
      while (node && node !== root) {
        y += node.offsetTop;
        node = node.offsetParent as HTMLElement | null;
      }
      return y;
    };

    const layoutRail = () => {
      const badges = [...trackEl.querySelectorAll<HTMLElement>('[data-step-badge]')];
      if (badges.length < 2) return false;
      const first = badges[0];
      const last = badges[badges.length - 1];
      const top = offsetWithin(first, trackEl) + first.offsetHeight / 2;
      const bottom = offsetWithin(last, trackEl) + last.offsetHeight / 2;
      railEl.style.top = `${top}px`;
      railEl.style.height = `${Math.max(0, bottom - top)}px`;
      return bottom > top;
    };

    if (!layoutRail()) return;

    // Full rather than empty: this is scroll-linked, so there is no animation to
    // shorten, only a final state to show. Matches useReveal, which likewise bails
    // out leaving its targets in their resolved state.
    if (prefersReducedMotion()) {
      gsap.set(fillEl, { scaleY: 1, transformOrigin: 'top' });
      return;
    }

    const tween = gsap.fromTo(
      fillEl,
      { scaleY: 0, transformOrigin: 'top' },
      {
        scaleY: 1,
        transformOrigin: 'top',
        // Linear: the rail reports scroll position, and any easing would make it
        // disagree with how far down the list the reader actually is.
        ease: 'none',
        scrollTrigger: {
          trigger: trackEl,
          start: 'top 30%',
          end: 'bottom 70%',
          scrub: true,
        },
      },
    );

    // Text rewraps at every width, which moves the badges and so changes both the
    // rail's extent and the scroll distance the tween is mapped over. Re-measure,
    // then let ScrollTrigger recache: without the refresh the fill would keep
    // running on the old start and end offsets.
    const observer = new ResizeObserver(() => {
      layoutRail();
      ScrollTrigger.refresh();
    });
    observer.observe(trackEl);

    return () => {
      observer.disconnect();
      tween.scrollTrigger?.kill();
      tween.kill();
    };
  }, []);

  return (
    <section
      id="how"
      ref={scope}
      aria-labelledby="how-title"
      className="px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-12 lg:grid-cols-[minmax(0,380px)_1fr] lg:gap-20">
          {/* ── Sticky intro ────────────────────────────────────────────── */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <span className="reveal eyebrow">How it works</span>
            <h2 id="how-title" className="reveal display-2 mt-4 text-balance">
              Up and running
              <br />
              <span className="text-muted-foreground">in minutes.</span>
            </h2>
            <p className="reveal lead mt-5 max-w-[360px]">
              No IT team, no installation, no consultant. Sign up and start entering your
              first members the same day.
            </p>
            <a href={APP_URL} className="reveal btn btn-primary btn-lg mt-8">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          {/* ── Steps ───────────────────────────────────────────────────── */}
          {/* No left padding for the rail to sit in: it runs at left-6, which is the
              centre of the 48px badge column, so it is already inside the row rather
              than beside it. */}
          <div ref={track} className="relative">
            {/*
              Progress rail. top and height are set from the badge positions in the
              effect above, so nothing here fixes them.

              2px, and centred on the badges by -translate-x-1/2 against left-6. The
              row dividers that used to make this section a set of 1px hairlines are
              gone, so a 2px accent line is now the section's own weight rather than
              the heaviest thing in it. Rounded caps on the track only: the fill is
              driven by scaleY, and a radius on a scaled element is squashed with it,
              so the fill's leading edge stays square.
            */}
            <div
              ref={rail}
              aria-hidden
              className="pointer-events-none absolute left-6 w-0.5 -translate-x-1/2 rounded-full bg-border-subtle"
            >
              <div
                ref={fill}
                className="h-full w-full origin-top scale-y-0 bg-accent will-change-transform"
              />
            </div>

            <ol className="relative flex flex-col">
              {STEPS.map(step => (
                <li
                  key={step.title}
                  /*
                    The gap is the bottom padding, not a flex gap, so that it belongs
                    to the row above it. That is what lets the rail segment between
                    two badges be exactly the padding, and what makes last:pb-0 stop
                    the list at the final step instead of leaving a trailing gap.
                  */
                  className="reveal flex gap-5 pb-24 last:pb-0 md:pb-36"
                >
                  <span
                    data-step-badge
                    aria-hidden
                    /*
                      relative z-10 so the badge paints over the rail running behind
                      it. accent-ink, not accent-text: this sits on a solid accent
                      fill, which is exactly the case that token exists for.
                    */
                    className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent"
                  >
                    <step.icon className="h-5 w-5 text-accent-ink" />
                  </span>

                  {/* Nudged down to sit the heading's cap height level with the
                      badge's centre rather than its top. */}
                  <div className="min-w-0 pt-1.5">
                    <h3 className="display-3 text-balance">{step.title}</h3>
                    <p className="mt-3 max-w-[560px] text-[14.5px] leading-relaxed text-muted-foreground">
                      {step.desc}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </section>
  );
}
