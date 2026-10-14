import { useReveal } from '../lib/useReveal';

/* The modules the launch film shows, in the order a gym owner thinks of them. */
const MODULES = [
  'Members',
  'Attendance',
  'Payments',
  'Reports',
  'WhatsApp automation',
  'Excel import',
] as const;

/**
 * The existing launch film in a native player. No sandbox gym and no chapter seeking:
 * the film is the only demo that exists, so the section says exactly that.
 *
 * preload="none" so nothing is downloaded until the visitor presses play; the poster
 * is the only cost on first view. Two <source>s with a media query pick the portrait
 * cut on narrow screens.
 */
export function ProductDemo() {
  const scope = useReveal<HTMLElement>({ stagger: 0.08 });

  return (
    <section
      id="demo"
      ref={scope}
      aria-labelledby="demo-title"
      className="has-dots scroll-mt-24 px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid items-center gap-10 lg:grid-cols-[1.4fr_1fr] lg:gap-16">
          <figure className="reveal m-0">
            <video
              controls
              playsInline
              preload="none"
              poster="/video/gymflow-launch-poster.webp"
              className="aspect-[9/16] max-h-[78vh] w-full rounded-card-lg border border-border-subtle bg-black object-contain sm:aspect-video sm:max-h-none"
            >
              <source
                src="/video/gymflow-launch-portrait.mp4"
                type="video/mp4"
                media="(max-width: 639px)"
              />
              <source src="/video/gymflow-launch.mp4" type="video/mp4" />
              Your browser cannot play this video.
            </video>
            <figcaption className="mt-3 text-[12.5px] text-muted-foreground">
              Shown with sample data.
            </figcaption>
          </figure>

          <div>
            <span className="reveal eyebrow">Demo</span>
            <h2 id="demo-title" className="reveal display-2 mt-4 text-balance">
              See GymFlow in action
            </h2>
            <p className="reveal lead mt-5 max-w-[460px]">
              A short film of the app at work. It covers:
            </p>
            <ul className="reveal mt-5 grid grid-cols-2 gap-x-6 gap-y-2.5">
              {MODULES.map(item => (
                <li key={item} className="flex items-center gap-2.5 text-[14px] text-foreground">
                  <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
