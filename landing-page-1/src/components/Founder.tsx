import type { ReactNode } from 'react';
import { useReveal } from '../lib/useReveal';

const LINK_CLASS =
  'inline-flex items-center gap-2 rounded font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

/* lucide-react v1 dropped brand icons, so each glyph is a small inline SVG. They are
   decorative (aria-hidden); the link text and aria-label carry the meaning. */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4 shrink-0"
    >
      {children}
    </svg>
  );
}

const PROFILES = [
  {
    label: 'Instagram',
    aria: 'Ganesamurthi V on Instagram',
    href: 'https://www.instagram.com/gxnessss.exe/',
    icon: (
      <Glyph>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="0.5" fill="currentColor" />
      </Glyph>
    ),
  },
  {
    label: 'LinkedIn',
    aria: 'Ganesamurthi V on LinkedIn',
    href: 'https://www.linkedin.com/in/ganesamurthi-v-b07315354',
    icon: (
      <Glyph>
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6z" />
        <rect x="2" y="9" width="4" height="12" />
        <circle cx="4" cy="4" r="2" />
      </Glyph>
    ),
  },
  {
    label: 'GitHub',
    aria: 'Ganesamurthi V on GitHub',
    href: 'https://github.com/Ganesamurthi-V',
    icon: (
      <Glyph>
        <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
      </Glyph>
    ),
  },
] as const;

/* Only the facts the owner supplied. There is no photo, so the avatar is initials. */
export function Founder() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section
      ref={scope}
      aria-labelledby="founder-title"
      className="px-5 py-16 md:px-8 md:py-20"
    >
      <div className="mx-auto max-w-[760px]">
        <div className="mx-auto max-w-[720px] text-center">
          <span className="reveal eyebrow">Founder</span>
          <h2 id="founder-title" className="reveal display-2 mt-4 text-balance">
            Who builds GymFlow
          </h2>
        </div>

        <div className="reveal card mt-10 flex flex-col items-center gap-6 p-6 text-center sm:flex-row sm:items-start sm:gap-8 sm:p-8 sm:text-left">
          <span
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-accent text-[20px] font-semibold tracking-tight text-accent-ink"
          >
            GV
          </span>
          <div>
            <h3 className="text-[20px] font-medium tracking-tight text-foreground">Ganesamurthi V</h3>
            <p className="mt-1 text-[13.5px] text-muted-foreground">Founder and developer</p>
            <p className="mt-4 text-[15px] leading-relaxed text-muted-foreground">
              I&rsquo;m a Computer Science engineering student building GymFlow to help Indian gyms
              replace manual record-keeping with digital management. My engineering background
              drives my focus on building practical, affordable software for gym owners.
            </p>
            <p className="mt-5 flex flex-wrap justify-center gap-x-5 gap-y-2 text-[13.5px] sm:justify-start">
              {PROFILES.map(profile => (
                <a
                  key={profile.href}
                  href={profile.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={profile.aria}
                  className={LINK_CLASS}
                >
                  {profile.icon}
                  {profile.label}
                </a>
              ))}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
