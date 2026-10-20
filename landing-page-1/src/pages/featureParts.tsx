import type { ReactNode } from 'react';
import { HeroPixels } from '../components/HeroPixels';
import BorderGlow from '../components/BorderGlow';
import { ShinyText } from '../components/ShinyText';
import {
  ArrowRight,
  CalendarCheck,
  ChartColumn,
  ChevronRight,
  ImageIcon,
  IndianRupee,
  Info,
  LayoutGrid,
  MessageCircle,
  PlayCircle,
  Smartphone,
  Upload,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  FEATURE_CARDS,
  FEATURE_OUTRO,
  RELATED_HEADING,
  getFeaturePage,
  parseInline,
  type FeatureBlock,
  type FeatureIcon,
  type FeaturePage,
} from '../data/featurePages';
import { CookieBanner } from '../components/CookieBanner';
import { Footer } from '../components/Footer';
import { Layout } from '../components/Layout';
import { Navbar } from '../components/Navbar';

const APP_URL = 'https://app.gymflow.sbs';

// The same three points as the homepage hero.
const TRUST_POINTS = ['14-day free trial', 'No credit card', 'Cancel anytime'] as const;

const LINK_CLASS =
  'font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

const ICONS: Record<FeatureIcon, LucideIcon> = {
  users: Users,
  rupee: IndianRupee,
  'calendar-check': CalendarCheck,
  smartphone: Smartphone,
  message: MessageCircle,
  chart: ChartColumn,
  upload: Upload,
};

/** Renders the **bold** and [link](href) markup the feature data uses. */
export function Inline({ text }: { text: string }) {
  return (
    <>
      {parseInline(text).map((node, i) => {
        if (node.kind === 'strong') {
          return (
            <strong key={i} className="font-medium text-foreground">
              {node.text}
            </strong>
          );
        }
        if (node.kind === 'link') {
          return (
            <a key={i} href={node.href} className={LINK_CLASS}>
              {node.text}
            </a>
          );
        }
        return node.text;
      })}
    </>
  );
}

/**
 * Navbar, page, footer and cookie card: the same frame as the homepage.
 */
export function FeatureShell({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <Navbar />
      {/* Opaque and above the footer from lg up: it is the curtain the footer is revealed under. */}
      <main id="main-content" className="bg-background lg:relative lg:z-10">
        {children}
      </main>
      <Footer reveal />
      <CookieBanner />
    </Layout>
  );
}

/**
 * The last word of the heading in the homepage accent italic. The space before it lives in the preceding text node, so the heading reads
 * "...software for India" to a text extractor and not "...software forIndia".
 */
function AccentHeading({ text }: { text: string }) {
  const cut = text.lastIndexOf(' ') + 1;
  return (
    <>
      {text.slice(0, cut)}
      <em className="display-accent">
        <ShinyText text={text.slice(cut)} speed={2.8} spread={120} />
      </em>
    </>
  );
}

function Breadcrumb({ page }: { page: FeaturePage }) {
  const hub = page.slug === 'features';
  const crumbs = [
    { name: 'Home', href: '/' },
    { name: 'Features', href: hub ? undefined : '/features' },
    ...(hub ? [] : [{ name: page.breadcrumb, href: undefined }]),
  ];
  return (
    <nav aria-label="Breadcrumb" className="hero-badge">
      <ol className="flex flex-wrap items-center justify-center gap-1.5 text-[13px] text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <li key={crumb.name} className="flex items-center gap-1.5">
            {i > 0 && <ChevronRight aria-hidden className="h-3.5 w-3.5" />}
            {crumb.href ? (
              <a href={crumb.href} className="hover:text-foreground">
                {crumb.name}
              </a>
            ) : (
              <span aria-current="page" className="text-foreground">
                {crumb.name}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/**
 * Hero of a feature page: the homepage hero's copy block over the same character-grid
 * backdrop, so every page opens like the homepage. HeroPixels lazy-loads CharGrid only once
 * its gates pass (motion allowed, connection not metered, browser idle), so the grid stays
 * out of the page's first load. The product film is left out; a content page has no use
 * for it. The entrance classes are the homepage's own.
 */
export function FeatureHero({ page }: { page: FeaturePage }) {
  const Icon = page.icon ? ICONS[page.icon] : LayoutGrid;
  return (
    <section
      aria-labelledby="feature-title"
      className="hero-surface hero-fill relative overflow-hidden px-5 pt-[124px] pb-20 md:px-8 md:pb-28"
    >
      <HeroPixels />

      <div className="mx-auto max-w-[900px] text-center">
        <Breadcrumb page={page} />

        <span className="hero-badge pill pill-accent mt-6">
          <Icon className="h-3.5 w-3.5" />
          {page.eyebrow}
        </span>

        <h1 id="feature-title" className="display-1 feature-h1 hero-line mt-6">
          <AccentHeading text={page.h1} />
        </h1>

        <p className="hero-sub lead mx-auto mt-6 max-w-[640px]">
          <Inline text={page.intro} />
        </p>

        <div className="mt-8 flex flex-row items-center justify-center gap-3">
          <a href={APP_URL} className="hero-cta btn btn-primary flex-1 basis-0 sm:flex-none">
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </a>
          <a href="/#pricing" className="hero-cta btn btn-outline flex-1 basis-0 sm:flex-none">
            See pricing
          </a>
        </div>

        <ul className="hero-trust mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {TRUST_POINTS.map(point => (
            <li key={point} className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
              {point}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

export function FeatureCard({ page }: { page: FeaturePage }) {
  const Icon = page.icon ? ICONS[page.icon] : LayoutGrid;
  return (
    <a href={`/${page.slug}`} className="reveal grid rounded-card focus-visible:outline-offset-4">
      <BorderGlow as="div" contentClassName="p-5 md:p-6" fillOpacity={0}>
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <Icon aria-hidden className="h-5 w-5" />
        </span>
        <h3 className="mt-4 text-[20px] font-medium leading-[1.15] tracking-tight text-foreground">{page.cardTitle}</h3>
        <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">{page.cardText}</p>
        <span className="mt-4 inline-flex items-center gap-1.5 text-[13px] font-medium text-accent-text">
          Learn more
          <ArrowRight aria-hidden className="h-4 w-4" />
        </span>
      </BorderGlow>
    </a>
  );
}

/** One card per feature page: the hub's main block. */
export function FeatureGrid() {
  return (
    <div className="mt-8 grid gap-3 md:grid-cols-2 lg:mt-10">
      {FEATURE_CARDS.map((card, i) => (
        // Seven cards in two columns: the last one spans both, so the final row has no hole.
        <div key={card.slug} className={i === FEATURE_CARDS.length - 1 ? 'grid md:col-span-2' : 'grid'}>
          <FeatureCard page={card} />
        </div>
      ))}
    </div>
  );
}

/* One column that runs straight down the page, like a document, across the full width of the
   content column (1240px): the owner wants the text to fill the page rather than sit in a narrow
   strip with empty sides. Two columns made the eye jump from the foot of the left column back to
   the top of the right, so it stays one. The type steps up with the screen and the leading is
   generous to keep the long lines trackable. Body copy is --foreground at 85% rather than
   --muted-foreground, which is fine for captions but too faint for whole paragraphs. */
const BODY = 'text-[16px] leading-[1.8] text-foreground/85 md:text-[17px] lg:text-[18px]';

function Paragraph({ text }: { text: string }) {
  return (
    <p className={`mt-5 ${BODY}`}>
      <Inline text={text} />
    </p>
  );
}

function Block({ block }: { block: FeatureBlock }) {
  switch (block.type) {
    case 'p':
      return <Paragraph text={block.text} />;
    case 'h3':
      return (
        <h3 className="mt-10 text-center text-[15px] font-semibold uppercase tracking-[0.14em] text-accent-text md:text-[16px]">
          {block.text}
        </h3>
      );
    case 'note':
      return (
        <div className="card-accent-soft mt-6 flex gap-3 p-5 md:p-6">
          <Info aria-hidden className="mt-1 h-4 w-4 shrink-0 text-accent-text" />
          <p className="text-[16px] leading-relaxed md:text-[17px]">
            <Inline text={block.text} />
          </p>
        </div>
      );
    // Points and paragraphs side by side: a list in the copy stays a list (bullets for things a
    // gym can do, numbers for steps), one point under the other down the same single column as
    // the paragraphs, with no card around them.
    case 'ul':
      return (
        <ul className="mt-5 grid gap-3">
          {block.items.map(item => (
            <li key={item} className={`flex gap-3 ${BODY}`}>
              <span aria-hidden className="mt-[0.7em] h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <span>
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ul>
      );
    case 'ol':
      return (
        <ol className="mt-5 grid gap-3">
          {block.items.map((item, i) => (
            <li key={item} className={`flex gap-4 ${BODY}`}>
              <span aria-hidden className="mt-[0.2em] grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent text-[13px] font-semibold text-accent-ink">
                {i + 1}
              </span>
              <span>
                <Inline text={item} />
              </span>
            </li>
          ))}
        </ol>
      );
    case 'features':
      return <FeatureGrid />;
  }
}

/** One content section: a numbered eyebrow, the centred heading with its accent last word, a blue bar and the blocks. */
export function SectionView({ heading, blocks, index }: { heading: string; blocks: FeatureBlock[]; index: number }) {
  const cut = heading.lastIndexOf(' ') + 1;
  return (
    <article className="reveal border-t border-border-subtle py-10 first:border-t-0 first:pt-0 md:py-12">
      <div className="flex flex-col items-center text-center">
        <span className="eyebrow">{String(index + 1).padStart(2, '0')}</span>
        <h2 className="display-3 mt-3 text-balance">
          {heading.slice(0, cut)}
          <em className="display-accent">{heading.slice(cut)}</em>
        </h2>
        <span aria-hidden className="mt-5 h-1 w-12 rounded-full bg-accent" />
      </div>
      {blocks.map((block, i) => (
        <Block key={i} block={block} />
      ))}
    </article>
  );
}

/* Dev-only box for an empty media slot. In production an empty slot renders nothing at all (no
   heading either), because an empty "coming soon" frame would look unfinished to visitors. */
function SlotPlaceholder({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="mx-auto mt-8 flex max-w-[780px] flex-col items-center rounded-card border-2 border-dashed border-border-strong bg-muted p-8 text-center">
      <Icon aria-hidden className="h-8 w-8 text-accent-text" />
      <p className="mt-3 text-[18px] font-medium text-foreground">{title}</p>
      <p className="mt-2 text-[15px] leading-relaxed text-foreground/75">{children}</p>
      <p className="mt-3 text-[13px] text-muted-foreground">Shown in npm run dev only. The live site hides this slot until a file is added.</p>
    </div>
  );
}

const CODE = 'rounded bg-surface-secondary px-1.5 py-0.5 font-mono text-[13px]';

/** The page's tutorial video: native player, no autoplay, size set so nothing shifts as it loads. */
export function TutorialSection({ page }: { page: FeaturePage }) {
  const tutorial = page.tutorial;
  if (!tutorial) return null;
  if (!tutorial.src) {
    if (!import.meta.env.DEV) return null;
    return (
      <section aria-label="Tutorial video" className="reveal">
        <h2 className="display-3 text-center text-balance">Watch how it works</h2>
        <SlotPlaceholder icon={PlayCircle} title="Tutorial video goes here">
          Add <code className={CODE}>public/features/{page.slug}/tutorial.mp4</code> and a poster, then set{' '}
          <code className={CODE}>tutorial.src</code>, <code className={CODE}>width</code> and{' '}
          <code className={CODE}>height</code> for this page in <code className={CODE}>src/data/featurePages.ts</code>.
        </SlotPlaceholder>
      </section>
    );
  }
  // A portrait phone recording stays phone-sized; a landscape one takes the reading column.
  const portrait = tutorial.height > tutorial.width;
  return (
    <section aria-label="Tutorial video" className="reveal">
      <h2 className="display-3 text-center text-balance">Watch how it works</h2>
      <figure className={`mt-8 w-full ${portrait ? 'max-w-[360px]' : 'max-w-[900px]'}`}>
        <video
          controls
          playsInline
          preload="none"
          poster={tutorial.poster}
          width={tutorial.width}
          height={tutorial.height}
          aria-label={tutorial.title}
          className="block h-auto w-full overflow-hidden rounded-card border border-border-subtle bg-muted"
        >
          <source src={tutorial.src} type="video/mp4" />
        </video>
        <figcaption className="mt-3 text-[14px] text-muted-foreground">{tutorial.title}</figcaption>
      </figure>
    </section>
  );
}

/** Real screenshots of the owner app, lazy-loaded in a responsive grid. */
export function ScreenshotsSection({ page }: { page: FeaturePage }) {
  const shots = page.screenshots ?? [];
  if (shots.length === 0) {
    if (!import.meta.env.DEV) return null;
    return (
      <section aria-label="Screenshots" className="reveal">
        <h2 className="display-3 text-center text-balance">See it in the app</h2>
        <SlotPlaceholder icon={ImageIcon} title="Screenshots go here">
          Add 2 to 4 screenshots to <code className={CODE}>public/features/{page.slug}/</code>, then list them in{' '}
          <code className={CODE}>screenshots</code> for this page in <code className={CODE}>src/data/featurePages.ts</code>.
        </SlotPlaceholder>
      </section>
    );
  }
  return (
    <section aria-label="Screenshots" className="reveal">
      <h2 className="display-3 text-center text-balance">See it in the app</h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {shots.map(shot => (
          <figure key={shot.src} className="card overflow-hidden">
            <img
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
            {shot.caption && <figcaption className="border-t border-border-subtle px-3 py-3 text-[14px] text-muted-foreground">{shot.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </section>
  );
}

export function RelatedFeatures({ page }: { page: FeaturePage }) {
  const related = page.related.map(getFeaturePage).filter((p): p is FeaturePage => !!p);
  if (related.length === 0) return null;
  return (
    <section aria-labelledby="related-title" className="contain-visible px-5 py-14 md:px-8 md:py-16">
      <div className="mx-auto max-w-[1240px]">
        <h2 id="related-title" className="reveal display-3 text-balance text-center">
          {RELATED_HEADING}
        </h2>
        <div className="mt-8 grid gap-3 md:grid-cols-3">
          {related.map(p => (
            <FeatureCard key={p.slug} page={p} />
          ))}
        </div>
        <p className="reveal mt-8 text-center text-[15px] text-muted-foreground">
          <Inline text={FEATURE_OUTRO} />
        </p>
      </div>
    </section>
  );
}
