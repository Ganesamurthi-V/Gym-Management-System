import { useState, type ReactNode } from 'react';
import {
  ArrowRight,
  BookOpen,
  CalendarCheck,
  ChartColumn,
  ChevronRight,
  Clock,
  Dumbbell,
  FileSpreadsheet,
  ImageIcon,
  IndianRupee,
  Info,
  Link2,
  MessageCircle,
  PlayCircle,
  Scale,
  Smartphone,
  Tag,
  Users,
  type LucideIcon,
} from 'lucide-react';
import {
  FEATURE_DATE_MODIFIED,
  FEATURE_FINEPRINT,
  FEATURE_OUTRO,
  FEATURE_PAGES,
  RELATED_HEADING,
  getFeaturePage,
  parseInline,
  sectionIds,
  type FeatureBlock,
  type FeaturePage,
  type FeatureSection,
} from '../data/featurePages';
import { CookieBanner } from '../components/CookieBanner';
import { Footer } from '../components/Footer';
import { Layout } from '../components/Layout';
import { Navbar } from '../components/Navbar';
import { DocsSearch } from './DocsSearch';
import { DocsToc, TocDisclosure } from './DocsToc';
import '../styles/feature.css';

const APP_URL = 'https://app.gymflow.sbs';

const LINK_CLASS =
  'font-medium text-accent-text underline underline-offset-4 transition-colors hover:text-foreground';

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

/** Navbar, page, footer and cookie card: the same frame as the homepage. */
export function FeatureShell({ children }: { children: ReactNode }) {
  return (
    <Layout>
      <Navbar />
      <main id="main-content" className="relative isolate bg-background">
        {children}
      </main>
      <Footer />
      <CookieBanner />
    </Layout>
  );
}

/* ── Article meta, derived from the data (nothing is stored per page) ───────── */

/** Pricing, guides and features read as three kinds of page; the label comes from the data's own `group`. */
export function categoryOf(page: FeaturePage): string {
  if (page.group === 'Guides') return 'Guide';
  if (page.group === 'Plans') return 'Pricing';
  if (page.slug === 'features') return 'Overview';
  return 'Feature';
}

function collectText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.map(collectText).join(' ');
  if (value && typeof value === 'object') return Object.values(value).map(collectText).join(' ');
  return '';
}

/** Whole minutes at 200 words a minute, counted over the intro and every section, never under 1. */
export function readingMinutes(page: FeaturePage): number {
  const text = `${page.intro} ${collectText(page.sections)}`.replace(/\*\*|\]\([^)]*\)|\[/g, '');
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 200));
}

const UPDATED = new Date(`${FEATURE_DATE_MODIFIED}T00:00:00Z`).toLocaleDateString('en-IN', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

function Meta({ page }: { page: FeaturePage }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[15px] text-muted-foreground">
      <span className="rounded-full border border-border bg-subtle px-3 py-0.5 font-medium text-foreground">{categoryOf(page)}</span>
      <span className="inline-flex items-center gap-1.5">
        <Clock aria-hidden className="h-4 w-4" />
        {readingMinutes(page)} min read
      </span>
      <span>Updated {UPDATED}</span>
    </p>
  );
}

/** The one breadcrumb on a page. A plain chevron glyph between sentence-case links; labels come from the data. */
export function Breadcrumb({ page }: { page: FeaturePage }) {
  const hub = page.slug === 'features';
  // Pricing and the guides sit directly under Home, the same as in the BreadcrumbList JSON-LD.
  const crumbs = [
    { name: 'Home', href: '/' },
    ...(page.topLevel ? [] : [{ name: 'Features', href: hub ? undefined : '/features' }]),
    ...(hub ? [] : [{ name: page.breadcrumb, href: undefined }]),
  ];
  // min-h-11 (44px) on every item is the tap target; the row wraps instead of overflowing.
  const item = 'inline-flex min-h-11 items-center';
  return (
    <nav aria-label="Breadcrumb" className="-ml-1">
      <ol className="flex flex-wrap items-center gap-x-1 text-[15px] text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <li key={crumb.name} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />}
            {crumb.href ? (
              <a href={crumb.href} className={`${item} px-1 transition-colors hover:text-foreground`}>
                {crumb.name}
              </a>
            ) : (
              <span aria-current="page" className={`${item} px-1 text-foreground`}>
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
 * The article head: slim breadcrumb (search beside it from md up), the keyword h1, the one-line summary and the
 * meta row. No hero banner and no backdrop: a reader arrives for the answer, so the page starts with it.
 */
export function ArticleHeader({ page }: { page: FeaturePage }) {
  return (
    <header className="px-5 pt-24 md:px-8 md:pt-28">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-8">
          <Breadcrumb page={page} />
          <div className="md:w-[280px]">
            <DocsSearch align="right" />
          </div>
        </div>
        <div className="mt-6 md:mt-8">
          <Meta page={page} />
          <h1 id="feature-title" className="article-h1 mt-4 max-w-[22em] text-balance">
            {page.h1}
          </h1>
          <p className="mt-4 max-w-[64ch] text-[18px] leading-[1.6] text-muted-foreground md:text-[19px]">
            <Inline text={page.intro} />
          </p>
        </div>
      </div>
    </header>
  );
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

const BODY = 'text-[17px] leading-[1.7] text-foreground/85 md:text-[18px]';

/** "**Label:** text" with at least three rows reads as a definition list: the label left, the text right. */
const LABELLED = /^\*\*([^*]+)\*\*\s*([\s\S]*)$/;

function isLabelledList(items: string[]) {
  return items.length >= 3 && items.every(item => LABELLED.test(item));
}

function Paragraph({ text }: { text: string }) {
  return (
    <p className={`mt-4 ${BODY}`}>
      <Inline text={text} />
    </p>
  );
}

function Bullets({ items }: { items: string[] }) {
  if (isLabelledList(items)) {
    // The panel's own width picks one column or two, so the list works in any column.
    return (
      <div className="@container mt-5">
        <ul className="divide-y divide-border-subtle overflow-clip rounded-xl border border-border-subtle bg-frame">
          {items.map(item => {
            const row = LABELLED.exec(item)!;
            return (
              <li key={item} className="grid gap-1 px-4 py-4 @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @md:gap-6 md:px-5">
                <p className="font-display text-[18px] font-semibold leading-snug text-foreground">{row[1].replace(/:$/, '')}</p>
                <p className={`min-w-0 ${BODY}`}>
                  <Inline text={row[2]} />
                </p>
              </li>
            );
          })}
        </ul>
      </div>
    );
  }
  return (
    <ul className={`article-list mt-4 ${BODY}`}>
      {items.map(item => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </ul>
  );
}

/** A sequence of events: a numbered list with a rail between the numerals. */
function Steps({ items }: { items: string[] }) {
  return (
    <ol className={`article-steps mt-5 ${BODY}`}>
      {items.map(item => (
        <li key={item}>
          <Inline text={item} />
        </li>
      ))}
    </ol>
  );
}

function Callout({ text }: { text: string }) {
  return (
    <aside className="mt-6 flex gap-3 rounded-xl border border-border-subtle bg-accent-soft p-4 md:p-5">
      <Info aria-hidden className="mt-1 h-5 w-5 shrink-0 text-accent-text" />
      <p className="min-w-0 text-[16px] leading-[1.65] text-foreground md:text-[17px]">
        <Inline text={text} />
      </p>
    </aside>
  );
}

function BlockView({ block }: { block: FeatureBlock }) {
  switch (block.type) {
    case 'p':
      return <Paragraph text={block.text} />;
    case 'h3':
      return <h3 className="mt-8 font-display text-[21px] font-semibold leading-snug text-foreground">{block.text}</h3>;
    case 'note':
      return <Callout text={block.text} />;
    case 'ul':
      return <Bullets items={block.items} />;
    case 'ol':
      return <Steps items={block.items} />;
    // The hub's index is drawn by FeaturesHub, never inside an article.
    case 'features':
      return null;
  }
}

/* ── Sections ───────────────────────────────────────────────────────────── */

interface QaGroup {
  q: string;
  body: FeatureBlock[];
}
type Item = { kind: 'block'; block: FeatureBlock } | { kind: 'qa'; groups: QaGroup[] };

/** A heading (h3) takes the paragraphs and lists after it; consecutive ones become one list of questions. */
function toItems(blocks: FeatureBlock[]): Item[] {
  const items: Item[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if (block.type !== 'h3') {
      items.push({ kind: 'block', block });
      continue;
    }
    const body: FeatureBlock[] = [];
    while (i + 1 < blocks.length && ['p', 'ul', 'ol'].includes(blocks[i + 1].type)) body.push(blocks[++i]);
    const last = items[items.length - 1];
    if (last?.kind === 'qa') last.groups.push({ q: block.text, body });
    else items.push({ kind: 'qa', groups: [{ q: block.text, body }] });
  }
  return items;
}

/** The accordion: ruled rows on native details, a plus that lies down into a minus. */
function Faq({ groups }: { groups: QaGroup[] }) {
  return (
    <ul className="mt-5 border-t border-border-subtle">
      {groups.map((group, i) => (
        <li key={group.q}>
          <details open={i === 0} className="doc-faq border-b border-border-subtle">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-6 py-4">
              <h3 className="font-display text-[19px] font-semibold leading-snug text-foreground transition-colors">{group.q}</h3>
              <span aria-hidden className="fx-glyph" />
            </summary>
            <div className="pb-5 [&>*:first-child]:mt-0">
              {group.body.map((block, k) => (
                <BlockView key={k} block={block} />
              ))}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

function ItemsView({ items, faq }: { items: Item[]; faq: boolean }) {
  return (
    <>
      {items.map((item, i) => {
        if (item.kind === 'block') return <BlockView key={i} block={item.block} />;
        if (faq) return <Faq key={i} groups={item.groups} />;
        return item.groups.map(group => (
          <div key={group.q}>
            <h3 className="mt-8 font-display text-[21px] font-semibold leading-snug text-foreground">{group.q}</h3>
            {group.body.map((block, k) => (
              <BlockView key={k} block={block} />
            ))}
          </div>
        ));
      })}
    </>
  );
}

function SectionView({ section, id, first }: { section: FeatureSection; id: string; first: boolean }) {
  const items = toItems(section.blocks);
  const faq = /question/i.test(section.heading) && items.some(item => item.kind === 'qa');
  const titleId = `${id}-title`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`scroll-mt-28 ${first ? '' : 'mt-10 border-t border-border-subtle pt-10 md:mt-12 md:pt-12'}`}
    >
      <h2 id={titleId} className="article-h2 text-balance">
        {section.heading}
        {/* A permalink for sharing: hover or focus shows it; phones skip it so the heading keeps the full width. */}
        <a href={`#${id}`} aria-label={`Link to section: ${section.heading}`} className="heading-anchor">
          <Link2 aria-hidden className="h-4 w-4" />
        </a>
      </h2>
      <ItemsView items={items} faq={faq} />
    </section>
  );
}

/**
 * The reading frame: an "On this page" disclosure on phones, a sticky right rail from lg up, and the article
 * column capped at 72ch. `children` (tutorial, screenshots) sit inside the column after the sections.
 */
export function ArticleBody({
  page,
  sections = page.sections,
  lead,
  children,
}: {
  page: FeaturePage;
  /** The hub passes the sections after its index; the TOC lists exactly these. */
  sections?: FeatureSection[];
  lead?: ReactNode;
  children?: ReactNode;
}) {
  // Ids come from the whole page so a link to /slug#id matches the no-JavaScript copy.
  const all = sectionIds(page);
  const ids = sections.map(s => all[page.sections.indexOf(s)]);
  const toc = sections.map((s, i) => ({ id: ids[i], label: s.heading }));
  return (
    <div className="px-5 pb-12 md:px-8 md:pb-16">
      <div className="mx-auto max-w-[1200px] pt-6 md:pt-8">
        <div className="border-t border-border-subtle pt-6 lg:hidden">
          <TocDisclosure items={toc} below="lg" />
        </div>
        <div className="grid gap-x-12 lg:grid-cols-[minmax(0,1fr)_260px] lg:pt-10">
          <article className="min-w-0 max-w-[92ch] pt-8 lg:pt-0">
            {lead}
            {sections.map((section, i) => (
              <SectionView key={section.heading} section={section} id={ids[i]} first={i === 0} />
            ))}
            {children}
          </article>
          <DocsToc items={toc} from="lg" />
        </div>
      </div>
    </div>
  );
}

/* ── Media ──────────────────────────────────────────────────────────────── */

/* Dev-only box for an empty media slot. In production an empty slot renders nothing at all (no
   heading either), because an empty "coming soon" frame would look unfinished to visitors. */
function SlotPlaceholder({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="slot-dev mt-6 flex flex-col items-start p-5 md:p-6">
      <Icon aria-hidden className="h-8 w-8 text-accent-text" />
      <p className="mt-3 text-[18px] font-medium text-foreground">{title}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-foreground/75">{children}</p>
      <p className="mt-3 text-[16px] text-muted-foreground">Shown in npm run dev only. The live site hides this slot until a file is added.</p>
    </div>
  );
}

const CODE = 'break-all rounded bg-subtle px-1.5 py-0.5 font-mono text-[14px]';

/** A quiet hairline panel that carries a capture, inside the article column. */
function Tray({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="my-10 rounded-xl border border-border-subtle bg-subtle p-4 md:my-12 md:p-6">
      {children}
    </section>
  );
}

/** The page's tutorial video: native player, no autoplay, size set so nothing shifts as it loads. */
export function TutorialSection({ page }: { page: FeaturePage }) {
  const tutorial = page.tutorial;
  if (!tutorial) return null;
  if (!tutorial.src) {
    if (!import.meta.env.DEV) return null;
    return (
      <Tray label="Tutorial video">
        <h2 className="article-h2">Watch how it works</h2>
        <SlotPlaceholder icon={PlayCircle} title="Tutorial video goes here">
          Add <code className={CODE}>public/features/{page.slug}/tutorial.mp4</code> and a poster, then set{' '}
          <code className={CODE}>tutorial.src</code>, <code className={CODE}>width</code> and{' '}
          <code className={CODE}>height</code> for this page in <code className={CODE}>src/data/featurePages.ts</code>.
        </SlotPlaceholder>
      </Tray>
    );
  }
  // A portrait phone recording stays phone-sized; a landscape one takes the tray.
  const portrait = tutorial.height > tutorial.width;
  return (
    <Tray label="Tutorial video">
      <h2 className="article-h2">Watch how it works</h2>
      <figure className={`mt-5 w-full ${portrait ? "max-w-[360px]" : "max-w-full"}`}>
        <video
          controls
          playsInline
          preload="none"
          poster={tutorial.poster}
          width={tutorial.width}
          height={tutorial.height}
          aria-label={tutorial.title}
          className="block h-auto w-full overflow-hidden rounded-lg border border-border-subtle bg-frame"
        >
          <source src={tutorial.src} type="video/mp4" />
        </video>
        <figcaption className="mt-3 text-[16px] text-muted-foreground">{tutorial.title}</figcaption>
      </figure>
    </Tray>
  );
}

/** Real screenshots of the owner app, lazy-loaded. */
export function ScreenshotsSection({ page }: { page: FeaturePage }) {
  const shots = page.screenshots ?? [];
  if (shots.length === 0) {
    if (!import.meta.env.DEV) return null;
    return (
      <Tray label="Screenshots">
        <h2 className="article-h2">See it in the app</h2>
        <SlotPlaceholder icon={ImageIcon} title="Screenshots go here">
          Add 2 to 4 screenshots to <code className={CODE}>public/features/{page.slug}/</code>, then list them in{' '}
          <code className={CODE}>screenshots</code> for this page in <code className={CODE}>src/data/featurePages.ts</code>.
        </SlotPlaceholder>
      </Tray>
    );
  }
  return (
    <Tray label="Screenshots">
      <h2 className="article-h2">See it in the app</h2>
      <div className="mt-5 grid gap-5 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {shots.map(shot => (
          <figure key={shot.src} className="overflow-hidden rounded-lg border border-border-subtle bg-frame">
            <img
              src={shot.src}
              alt={shot.alt}
              width={shot.width}
              height={shot.height}
              loading="lazy"
              decoding="async"
              className="block h-auto w-full"
            />
            {shot.caption && <figcaption className="border-t border-border-subtle px-3 py-3 text-[16px] text-muted-foreground">{shot.caption}</figcaption>}
          </figure>
        ))}
      </div>
    </Tray>
  );
}

/* ── Index cards (hub) ──────────────────────────────────────────────────── */

/* One icon per page for the card cover. Pages not listed fall back by category: a book for a guide. */
const COVER_ICON: Record<string, LucideIcon> = {
  members: Users,
  'fees-and-dues': IndianRupee,
  attendance: CalendarCheck,
  'member-app': Smartphone,
  'workout-programs': Dumbbell,
  whatsapp: MessageCircle,
  reports: ChartColumn,
  'import-export': FileSpreadsheet,
  pricing: Tag,
  'gym-software-vs-excel': Scale,
};

/** A simple generated cover in the site's own language: a tinted panel with a hairline frame, corner crosses and one
    icon tile. Blue for features, amber for pricing, green for guides. No image file to keep in step with the page. */
function PageCover({ page }: { page: FeaturePage }) {
  const Icon = COVER_ICON[page.slug] ?? BookOpen;
  const tone = categoryOf(page).toLowerCase();
  return (
    <div aria-hidden className={`card-cover card-cover--${tone}`}>
      <i className="card-cover__mark card-cover__mark--tl" />
      <i className="card-cover__mark card-cover__mark--tr" />
      <i className="card-cover__mark card-cover__mark--bl" />
      <i className="card-cover__mark card-cover__mark--br" />
      <span className="card-cover__tile">
        <Icon className="size-7" strokeWidth={1.75} />
      </span>
    </div>
  );
}

export function PageCard({ page }: { page: FeaturePage }) {
  return (
    <a
      href={`/${page.slug}`}
      className="group flex h-full min-h-11 flex-col overflow-hidden rounded-xl border border-border-subtle bg-frame transition-colors hover:border-border-strong"
    >
      <PageCover page={page} />
      <span className="flex flex-1 flex-col p-5">
        <span className="flex items-center gap-3 text-[14px] text-muted-foreground">
          <span className="font-medium text-accent-text">{categoryOf(page)}</span>
          <span className="inline-flex items-center gap-1">
            <Clock aria-hidden className="h-3.5 w-3.5" />
            {readingMinutes(page)} min read
          </span>
        </span>
        <h3 className="mt-3 font-display text-[21px] font-semibold leading-snug text-foreground group-hover:text-accent-text">
          {page.cardTitle}
        </h3>
        <span className="mt-2 block text-[16px] leading-relaxed text-muted-foreground">{page.cardText}</span>
      </span>
    </a>
  );
}

/** Every page except the hub, with category chips that filter the grid. */
export function PageIndex({ heading, id }: { heading: string; id: string }) {
  const pages = FEATURE_PAGES.filter(p => p.slug !== 'features');
  const categories = ['All', ...Array.from(new Set(pages.map(categoryOf)))];
  const [active, setActive] = useState('All');
  const shown = active === 'All' ? pages : pages.filter(p => categoryOf(p) === active);
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <h2 id={`${id}-title`} className="article-h2">
        {heading}
      </h2>
      <div role="group" aria-label="Filter by category" className="mt-4 flex flex-wrap gap-2">
        {categories.map(name => (
          <button
            key={name}
            type="button"
            aria-pressed={active === name}
            onClick={() => setActive(name)}
            className={`min-h-11 rounded-full border px-4 text-[15px] font-medium transition-colors ${
              active === name
                ? 'border-foreground bg-foreground text-background'
                : 'border-border bg-frame text-foreground hover:border-border-strong'
            }`}
          >
            {name === 'Pricing' ? name : name === 'All' ? name : `${name}s`}
          </button>
        ))}
      </div>
      <ul className="mt-6 grid gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
        {shown.map(p => (
          <li key={p.slug}>
            <PageCard page={p} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ── End of the article ─────────────────────────────────────────────────── */

/** Related pages, then Previous / Next as cards, then the one quiet call to action. */
export function ArticleFooter({ page }: { page: FeaturePage }) {
  const related = page.related.map(getFeaturePage).filter((p): p is FeaturePage => !!p);
  const i = FEATURE_PAGES.findIndex(p => p.slug === page.slug);
  const prev = FEATURE_PAGES[i - 1];
  const next = FEATURE_PAGES[i + 1];
  return (
    <div className="px-5 pb-16 md:px-8 md:pb-24">
      <div className="mx-auto max-w-[1200px] border-t border-border-subtle pt-10 md:pt-12">
        {related.length > 0 && (
          <section aria-labelledby="related-title">
            <h2 id="related-title" className="article-h2">
              {RELATED_HEADING}
            </h2>
            <ul className="mt-5 grid gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))] lg:grid-cols-[repeat(3,minmax(0,1fr))]">
              {related.map(p => (
                <li key={p.slug}>
                  <PageCard page={p} />
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[16px] text-muted-foreground">
              <Inline text={FEATURE_OUTRO} />
            </p>
          </section>
        )}
        <nav aria-label="Previous and next article" className="mt-10 grid gap-4 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
          {prev && <PagerCard target={prev} dir="prev" />}
          {next && <PagerCard target={next} dir="next" />}
        </nav>
        <section
          aria-labelledby="feature-close-title"
          className="mt-10 flex flex-col gap-6 rounded-xl border border-border-subtle bg-subtle p-6 md:mt-12 md:flex-row md:items-center md:justify-between md:p-8"
        >
          <div className="min-w-0">
            <h2 id="feature-close-title" className="article-h2 text-balance">
              Stop managing members. Start growing your gym.
            </h2>
            <p className="mt-2 text-[16px] text-muted-foreground">{FEATURE_FINEPRINT}</p>
          </div>
          <a href={APP_URL} className="btn btn-primary btn-lg shrink-0 self-start md:self-center">
            Start free trial
          </a>
        </section>
      </div>
    </div>
  );
}

function PagerCard({ target, dir }: { target: FeaturePage; dir: 'prev' | 'next' }) {
  return (
    <a
      href={`/${target.slug}`}
      rel={dir}
      className={`group block min-h-16 rounded-xl border border-border-subtle bg-frame p-5 transition-colors hover:border-border-strong ${
        dir === 'next' ? 'text-right sm:col-start-2' : ''
      }`}
    >
      <span className="block text-[14px] text-muted-foreground">{dir === 'prev' ? 'Previous' : 'Next'}</span>
      <span
        className={`mt-1 flex items-center gap-2 font-display text-[19px] font-semibold text-foreground group-hover:text-accent-text ${
          dir === 'next' ? 'justify-end' : ''
        }`}
      >
        {dir === 'prev' && <ArrowRight aria-hidden className="h-4 w-4 shrink-0 rotate-180" />}
        <span className="min-w-0">{target.slug === 'features' ? 'All features' : (target.cardTitle ?? target.breadcrumb)}</span>
        {dir === 'next' && <ArrowRight aria-hidden className="h-4 w-4 shrink-0" />}
      </span>
    </a>
  );
}
