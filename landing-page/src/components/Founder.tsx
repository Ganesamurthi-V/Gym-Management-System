import type { ReactNode } from 'react';
import { Rise } from './fx';
import '../styles/close.css';

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
  return (
    /* The section ends on the paper card, which hangs half over the blue band below (CTA), so
       the page closes as one composed moment. Not the Section primitive: it clips overflow. */
    <section aria-labelledby="founder-title" className="close-founder contain-visible relative z-10 px-5 pt-24 md:px-8 md:pt-32">
      <div className="mx-auto max-w-[1200px]">
      <h2 id="founder-title" className="display-2 text-balance">{'Who builds GymFlow'}</h2>
      <Rise className="close-letter mt-10 md:mt-12 lg:ml-auto">
        <p className="text-[18px] leading-relaxed text-foreground">
          I&rsquo;m a Computer Science engineering student building GymFlow to help Indian gyms
          replace manual record-keeping with digital management. My engineering background
          drives my focus on building practical, affordable software for gym owners.
        </p>
        <div className="mt-8 flex items-center gap-4">
          <span
            aria-hidden
            className="grid h-16 w-16 shrink-0 place-items-center rounded-[14px] bg-accent font-display text-[20px] font-bold text-accent-ink"
          >
            GV
          </span>
          <div>
            <h3 className="font-display text-[28px] font-bold leading-tight tracking-[-0.02em] text-foreground">Ganesamurthi V</h3>
            <p className="text-[16px] text-muted-foreground">Founder and developer</p>
          </div>
        </div>
        <p className="mt-6 flex flex-wrap gap-x-6 gap-y-1 text-[16px]">
          {PROFILES.map(profile => (
            <a
              key={profile.href}
              href={profile.href}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={profile.aria}
              className={`${LINK_CLASS} min-h-[44px]`}
            >
              {profile.icon}
              {profile.label}
            </a>
          ))}
        </p>
      </Rise>
      </div>
    </section>
  );
}
