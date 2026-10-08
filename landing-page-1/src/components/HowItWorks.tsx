import { useEffect, useRef } from 'react';
import { ArrowRight, FileSpreadsheet, LayoutDashboard, UserPlus } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion, useReveal } from '../lib/useReveal';

gsap.registerPlugin(ScrollTrigger);

const APP_URL = 'https://app.gymflow.sbs';

/* Three steps, each a title of two or three words and one plain sentence.

   This used to be four steps with a 30-40 word paragraph apiece plus a sticky
   picture that swapped as you scrolled — a lot to read and track for what is
   really "sign up, add members, run the gym". The reporting step is covered by
   the features section, so it is not repeated here.

   Still an <ol>, so the order is carried by the markup. */
const STEPS = [
  {
    icon: UserPlus,
    title: 'Sign up',
    desc: 'Set up your gym in about 5 minutes.',
  },
  {
    icon: FileSpreadsheet,
    title: 'Add members',
    desc: 'Upload your Excel sheet, or add them one by one.',
  },
  {
    icon: LayoutDashboard,
    title: 'Run your gym',
    desc: 'Attendance, payments and WhatsApp reminders, all from your phone.',
  },
] as const;

export function HowItWorks() {
  const scope = useReveal<HTMLElement>({ stagger: 0.1 });
  const track = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLDivElement>(null);

  /*
    Scroll-linked progress rail beside the steps.

    scaleY rather than height: height is a layout property, so driving it every
    frame reflows the list, while scaleY is a compositor transform on a plain
    rectangle. transformOrigin is set explicitly because GSAP defaults to the
    centre, which would grow the fill both ways from the middle.

    The fill starts when the list's top passes 30% down the viewport and completes
    when its bottom reaches 70%. Tracking the list rather than the whole section on
    purpose: the section's padding is not what the progress is about, and including
    it would leave the rail visibly unfinished once the last step had been read.

    The rail runs badge centre to badge centre, measured rather than expressed in
    CSS, because neither end is a percentage of anything. Measured with offsetTop
    and offsetHeight, not getBoundingClientRect, and that is load-bearing:
    useReveal is declared above this hook so its effect runs first, which means
    every row is still sitting low under its opening tween. Rects would capture
    that displacement and the rail would end up out once the reveal settled. The
    offset properties come from layout and ignore transforms entirely.
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
    // shorten, only a final state to show.
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

    // Text rewraps at every width, which moves the badges and changes both the
    // rail's extent and the scroll distance the tween is mapped over.
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
      className="has-dots px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
          {/* Heading, line and button stay put while the steps scroll past. Sticky
              from lg only; below that the two halves simply stack. */}
          <div className="lg:sticky lg:top-36 lg:self-start">
            <span className="reveal eyebrow">How it works</span>
            <h2 id="how-title" className="reveal display-2 mt-4 text-balance">
              Up and running
              <br />
              in <em className="display-accent">minutes.</em>
            </h2>
            <p className="reveal lead mt-6 max-w-[520px]">
              No IT team, no installation, no consultant. Sign up and start entering your
              first members the same day.
            </p>
            <a href={APP_URL} className="reveal btn btn-primary btn-lg mt-10">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
          </div>

          <div ref={track} className="relative">
            {/* Progress rail. top and height are set from the badge positions in the
                effect above. 2px, centred on the 48px badges by -translate-x-1/2
                against left-6. Rounded caps on the track only: the fill is driven by
                scaleY, and a radius on a scaled element is squashed with it. */}
            <div
              ref={rail}
              aria-hidden
              className="pointer-events-none absolute left-6 w-0.5 -translate-x-1/2 rounded-full bg-border-subtle"
            >
              <div className="h-full w-full origin-top scale-y-0 bg-accent will-change-transform" ref={fill} />
            </div>

            <ol className="relative flex flex-col">
              {STEPS.map(step => (
                <li
                  key={step.title}
                  /* The gap is the bottom padding, not a flex gap, so it belongs to
                     the row above it: the rail segment between two badges is exactly
                     the padding, and last:pb-0 stops the list at the final step. */
                  className="reveal flex gap-5 pb-32 last:pb-0 md:pb-48"
                >
                  <span
                    data-step-badge
                    aria-hidden
                    className="relative z-10 grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent"
                  >
                    <step.icon className="h-5 w-5 text-accent-ink" />
                  </span>

                  <div className="min-w-0 pt-1.5">
                    <h3 className="display-3 text-balance">{step.title}</h3>
                    <p className="mt-3 max-w-[460px] text-[16px] leading-relaxed text-muted-foreground">
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
