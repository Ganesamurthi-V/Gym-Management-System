import { useId, type ReactNode } from 'react';
import { ChevronRight, ImageIcon, PlayCircle, type LucideIcon } from 'lucide-react';
import {
  FEATURE_CARDS,
  FEATURE_PAGES,
  docLabel,
  FEATURE_FINEPRINT,
  FEATURE_OUTRO,
  RELATED_HEADING,
  getFeaturePage,
  parseInline,
  sectionIds,
  type FeatureBlock,
  type FeaturePage,
  type FeatureSection,
} from '../data/featurePages';
import { AsciiField } from '../components/ascii';
import { CookieBanner } from '../components/CookieBanner';
import { Footer } from '../components/Footer';
import { Layout } from '../components/Layout';
import { Navbar } from '../components/Navbar';
import { Split } from '../components/layout/Section';
import { Magnet, Rise, SpotlightSurface, StampIn } from '../components/fx';
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
      {/* Opaque and above the footer from lg up: it is the curtain the footer is revealed under. */}
      <main id="main-content" className="relative isolate bg-background lg:z-10">
        {children}
      </main>
      <Footer reveal />
      <CookieBanner />
    </Layout>
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
    <nav aria-label="Breadcrumb">
      <ol className="flex flex-wrap items-center gap-x-1 text-[16px] text-muted-foreground">
        {crumbs.map((crumb, i) => (
          <li key={crumb.name} className="flex min-w-0 items-center gap-1">
            {i > 0 && <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />}
            {crumb.href ? (
              <a href={crumb.href} className={`${item} px-1 transition-colors hover:text-foreground`}>
                <span className="link-grow">{crumb.name}</span>
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
 * The page head: breadcrumb, the keyword h1, the lead and the one action, over the live ASCII field. It leaves 96px
 * above for the nav bar. `search` adds the docs search beside the breadcrumb (pages without a sidebar).
 */
export function FeatureHead({ page, search = false }: { page: FeaturePage; search?: boolean }) {
  // Keeps the head's search field on the useId it had before the redesign.
  useId();
  return (
    <header className="feature-head relative overflow-clip px-5 pb-16 pt-24 md:px-8 md:pb-24 md:pt-28">
      <AsciiField height={480} intensity={0.4} />
      <div className="relative z-10 mx-auto max-w-[1200px]">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between md:gap-8">
          <Breadcrumb page={page} />
          {search && (
            <div className="md:w-[320px]">
              <DocsSearch align="right" />
            </div>
          )}
        </div>
        <Rise>
          <h1 id="feature-title" className="display-1 feature-h1 mt-6 text-balance md:mt-10">
            {page.h1}
          </h1>
          <p className="lead mt-6 max-w-[60ch]">
            <Inline text={page.intro} />
          </p>
          <div className="mt-10">
            <Magnet className="inline-block">
              <a href={APP_URL} className="btn btn-primary btn-lg">
                Start free trial
              </a>
            </Magnet>
            <p className="mt-4 text-[16px] text-muted-foreground">{FEATURE_FINEPRINT}</p>
          </div>
        </Rise>
      </div>
    </header>
  );
}

/** Page title kept for callers that only need the h1 and intro. */
export function FeatureTitle({ page }: { page: FeaturePage }) {
  return <FeatureHead page={page} />;
}

/* ── The hub's list of features ─────────────────────────────────────────── */

export function FeatureCard({ page }: { page: FeaturePage }) {
  return (
    <a href={`/${page.slug}`} className="group block py-6 pl-5 md:py-7 md:pl-7">
      <h3 className="display-3 text-foreground">
        <span className="link-grow">{page.cardTitle}</span>
      </h3>
      <p className="mt-2 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">{page.cardText}</p>
    </a>
  );
}

/** One ruled row per feature page: the hub's main block. */
export function FeatureGrid() {
  return (
    <ul className="border-t border-border-subtle">
      {FEATURE_CARDS.map(card => (
        <li key={card.slug} className="row-bar border-b border-border-subtle">
          <FeatureCard page={card} />
        </li>
      ))}
    </ul>
  );
}

/* ── Blocks ─────────────────────────────────────────────────────────────── */

const BODY = 'text-[17px] leading-[1.65] text-foreground/85';

/** "**Label:** text" with at least three rows reads as a ledger: the label left, the text right. */
const LABELLED = /^\*\*([^*]+)\*\*\s*([\s\S]*)$/;

function Paragraph({ text }: { text: string }) {
  return (
    <p className={`mt-5 max-w-[65ch] ${BODY}`}>
      <Inline text={text} />
    </p>
  );
}

/** Whether a list of bullets renders as a ledger panel (so the section after it can stay flat). */
function isLedgerList(items: string[]) {
  return items.length >= 3 && items.every(item => LABELLED.test(item));
}

/* The ledger is a white panel; its rows switch to label | text by the panel's own width, so it works in any column. */
const LEDGER_ROW = 'grid gap-1 px-5 py-5 @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @md:gap-8 md:px-7';

function Bullets({ items, flat }: { items: string[]; flat: boolean }) {
  if (!flat && isLedgerList(items)) {
    const rows = items.map(item => LABELLED.exec(item)!);
    return (
      <div className="@container mt-6">
        <ul className="plastic divide-y divide-border-subtle overflow-clip">
          {rows.map((row, i) => (
            <li key={items[i]} className={LEDGER_ROW}>
              <h3 className="font-display text-[19px] font-medium leading-snug text-foreground">{row[1].replace(/:$/, "")}</h3>
              <p className={`min-w-0 ${BODY}`}>
                <Inline text={row[2]} />
              </p>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <ul className="mt-6 max-w-[65ch] border-t border-border-subtle">
      {items.map(item => (
        <li key={item} className={`row-bar border-b border-border-subtle py-4 pl-5 ${BODY}`}>
          <Inline text={item} />
        </li>
      ))}
    </ul>
  );
}

/** A sequence of events: one white slip per step, a small blue numeral chip on each. */
function Steps({ items }: { items: string[] }) {
  return (
    <ol className="mt-6 grid max-w-[760px] gap-3">
      {items.map((item, i) => (
        <Rise as="li" key={item} delay={i * 0.05}>
          <div className="slip flex items-start gap-4 p-4 md:gap-5 md:p-5">
            <StampIn delay={0.12} className="shrink-0">
              <span
                aria-hidden
                className="num flex h-8 w-8 items-center justify-center rounded-full bg-accent font-display text-[15px] font-semibold text-accent-ink"
              >
                {i + 1}
              </span>
            </StampIn>
            <p className="min-w-0 pt-1 font-sans text-[17px] leading-[1.65] text-foreground">
              <span className="sr-only">{`Step ${i + 1}: `}</span>
              <Inline text={item} />
            </p>
          </div>
        </Rise>
      ))}
    </ol>
  );
}

function Note({ text }: { text: string }) {
  return (
    <div className="mt-6 max-w-[65ch] rounded-[10px] border border-l-2 border-border-subtle border-l-accent bg-frame p-5 md:p-6">
      <p className="text-[17px] leading-[1.65] text-foreground">
        <Inline text={text} />
      </p>
    </div>
  );
}

function BlockView({ block, flat }: { block: FeatureBlock; flat: boolean }) {
  switch (block.type) {
    case 'p':
      return <Paragraph text={block.text} />;
    case 'h3':
      return <h3 className="mt-8 font-display text-[22px] font-medium text-foreground">{block.text}</h3>;
    case 'note':
      return <Note text={block.text} />;
    case 'ul':
      return <Bullets items={block.items} flat={flat} />;
    case 'ol':
      return <Steps items={block.items} />;
    case 'features':
      return <FeatureGrid />;
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

type Variant = 'index' | 'faq' | 'record' | 'ledger' | 'ruled' | 'prose';

function variantOf(section: FeatureSection, items: Item[]): Variant {
  const qa = items.find(item => item.kind === 'qa');
  if (section.blocks.some(b => b.type === 'features')) return 'index';
  if (qa && /question/i.test(section.heading)) return 'faq';
  if (qa) return 'ledger';
  if (section.blocks.some(b => b.type === 'ol')) return 'record';
  if (section.blocks.some(b => b.type === 'ul')) return 'ruled';
  return 'prose';
}

/** True when the section is drawn as a white ledger panel. */
function isPanel(section: FeatureSection, variant: Variant) {
  if (variant === 'ledger') return true;
  return variant === 'ruled' && section.blocks.some(b => b.type === 'ul' && isLedgerList(b.items));
}

/** The accordion: ruled rows on native details, a plus that lies down into a minus. */
function Faq({ groups }: { groups: QaGroup[] }) {
  return (
    <ul className="mt-6 border-t border-border-subtle">
      {groups.map((group, i) => (
        <li key={group.q}>
          <details open={i === 0} className="faq-item border-b border-border-subtle">
            <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-6 py-5">
              <h3 className="font-display text-[20px] font-medium leading-snug text-foreground transition-colors">{group.q}</h3>
              <span aria-hidden className="fx-glyph" />
            </summary>
            <div className="pb-6 pr-8">
              {group.body.map((block, k) => (
                <BlockView key={k} block={block} flat />
              ))}
            </div>
          </details>
        </li>
      ))}
    </ul>
  );
}

/** Questions with answers: a white panel ledger (question left, answer right), or ruled rows when `flat`. */
function Ledger({ groups, flat }: { groups: QaGroup[]; flat: boolean }) {
  const answers = (group: QaGroup) => group.body.map((block, k) => <BlockView key={k} block={block} flat />);
  if (flat) {
    return (
      <ul className="@container mt-6 border-t border-border-subtle">
        {groups.map(group => (
          <li
            key={group.q}
            className="row-bar grid gap-2 border-b border-border-subtle py-6 pl-5 @md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] @md:gap-8"
          >
            <h3 className="font-display text-[20px] font-medium leading-snug text-foreground">{group.q}</h3>
            <div className="min-w-0 [&>*:first-child]:mt-0">{answers(group)}</div>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <div className="@container mt-6">
      <ul className="plastic divide-y divide-border-subtle overflow-clip">
        {groups.map(group => (
          <li key={group.q} className={`${LEDGER_ROW} !py-6`}>
            <h3 className="font-display text-[20px] font-medium leading-snug text-foreground">{group.q}</h3>
            <div className="min-w-0 [&>*:first-child]:mt-0">{answers(group)}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ItemsView({ items, faq, flat = false }: { items: Item[]; faq: boolean; flat?: boolean }) {
  return (
    <>
      {items.map((item, i) =>
        item.kind === 'block' ? (
          <BlockView key={i} block={item.block} flat={flat} />
        ) : faq ? (
          <Faq key={i} groups={item.groups} />
        ) : (
          <Ledger key={i} groups={item.groups} flat={flat} />
        )
      )}
    </>
  );
}

type Arrangement = 'split' | 'stack';

const BASE: Record<Variant, Arrangement> = {
  index: 'stack',
  faq: 'split',
  record: 'stack',
  ledger: 'stack',
  ruled: 'split',
  prose: 'split',
};

/**
 * The sections of a feature page, all on the head's 1200px container (left edge shared), with the sticky "On this
 * page" list in its right column. Each section is composed by what it holds: questions an accordion, steps white
 * slips, labelled points a ledger panel, plain points a ruled list. A section never repeats the composition of the
 * one before it: a repeated shape flips between head-beside and head-above, a second ledger panel in a row goes flat.
 */
export function FeatureSections({ page }: { page: FeaturePage }) {
  const ids = sectionIds(page);
  const toc = page.sections.map((s, i) => ({ id: ids[i], label: s.heading }));
  let prev: { variant: Variant; arrangement: Arrangement; panel: boolean } | undefined;
  return (
    <div className="px-5 md:px-8">
      <div className="mx-auto max-w-[1200px]">
        <div className="lg:hidden">
          <TocDisclosure items={toc} below="lg" />
        </div>
        <div className="grid gap-x-16 lg:grid-cols-[minmax(0,1fr)_200px]">
          <div className="min-w-0">
            {page.sections.map((section, i) => {
              const items = toItems(section.blocks);
              const variant = variantOf(section, items);
              let arrangement = BASE[variant];
              // Same shape as its neighbour: change the arrangement.
              if (prev && prev.variant === variant) arrangement = prev.arrangement === 'split' ? 'stack' : 'split';
              const panel = isPanel(section, variant);
              const flat = panel && !!prev?.panel;
              prev = { variant, arrangement, panel: panel && !flat };
              const titleId = `${ids[i]}-title`;
              const split = arrangement === 'split';
              return (
                <section
                  key={section.heading}
                  id={ids[i]}
                  aria-labelledby={titleId}
                  className="scroll-mt-24 border-t border-border-subtle py-14 first:border-t-0 md:py-20"
                >
                  <div className={split ? 'grid gap-8 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-12' : ''}>
                    <Rise>
                      <h2 id={titleId} className={`${split ? 'display-3' : 'display-2'} text-balance`}>
                        {section.heading}
                      </h2>
                    </Rise>
                    <Rise className={`min-w-0 [&>*:first-child]:mt-0 ${split ? '' : 'mt-8 md:mt-10'}`}>
                      <ItemsView items={items} faq={variant === 'faq'} flat={flat} />
                    </Rise>
                  </div>
                </section>
              );
            })}
          </div>
          <DocsToc items={toc} from="lg" />
        </div>
      </div>
    </div>
  );
}

/** The sections of a guide, as a calm article in the docs shell's 65ch column. */
export function DocSections({ page }: { page: FeaturePage }) {
  const ids = sectionIds(page);
  let prevPanel = false;
  return (
    <div className="doc-prose">
      {page.sections.map((section, i) => {
        const items = toItems(section.blocks);
        const variant = variantOf(section, items);
        const panel = isPanel(section, variant);
        const flat = panel && prevPanel;
        prevPanel = panel && !flat;
        const titleId = `${ids[i]}-title`;
        return (
          <section
            key={section.heading}
            id={ids[i]}
            aria-labelledby={titleId}
            className="scroll-mt-24 border-t border-border-subtle py-10 first:border-t-0 first:pt-0 md:py-12"
          >
            <Rise>
              <h2 id={titleId} className="display-3 text-balance">
                {section.heading}
              </h2>
              <div className="[&>*:first-child]:mt-6">
                <ItemsView items={items} faq={variant === 'faq'} flat={flat} />
              </div>
            </Rise>
          </section>
        );
      })}
    </div>
  );
}

/* ── Media ──────────────────────────────────────────────────────────────── */

/* Dev-only box for an empty media slot. In production an empty slot renders nothing at all (no
   heading either), because an empty "coming soon" frame would look unfinished to visitors. */
function SlotPlaceholder({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <div className="slot-dev mt-8 flex max-w-[780px] flex-col items-start p-6 md:p-8">
      <Icon aria-hidden className="h-8 w-8 text-accent-text" />
      <p className="mt-3 text-[18px] font-medium text-foreground">{title}</p>
      <p className="mt-2 text-[16px] leading-relaxed text-foreground/75">{children}</p>
      <p className="mt-3 text-[16px] text-muted-foreground">Shown in npm run dev only. The live site hides this slot until a file is added.</p>
    </div>
  );
}

const CODE = 'break-all bg-subtle px-1.5 py-0.5 font-mono text-[14px]';

/**
 * An --accent-soft panel that carries a big product capture, on the same 1200px container as the head.
 * `inline` drops the page padding and width cap, for use inside a guide's article column.
 */
function Tray({ label, inline, children }: { label: string; inline: boolean; children: ReactNode }) {
  const panel = (
    <SpotlightSurface className="rounded-[20px] border border-border-subtle bg-accent-soft p-6 md:p-12">
      {children}
    </SpotlightSurface>
  );
  return (
    <section aria-label={label} className={inline ? 'py-6' : 'px-5 py-8 md:px-8 md:py-12'}>
      {inline ? panel : <div className="mx-auto max-w-[1200px]">{panel}</div>}
    </section>
  );
}

/** The page's tutorial video: native player, no autoplay, size set so nothing shifts as it loads. */
export function TutorialSection({ page, inline = false }: { page: FeaturePage; inline?: boolean }) {
  const tutorial = page.tutorial;
  if (!tutorial) return null;
  if (!tutorial.src) {
    if (!import.meta.env.DEV) return null;
    return (
      <Tray label="Tutorial video" inline={inline}>
        <h2 className="display-3 text-balance">Watch how it works</h2>
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
    <Tray label="Tutorial video" inline={inline}>
      <h2 className="display-3 text-balance">Watch how it works</h2>
      <figure className={`mt-8 w-full ${portrait ? 'max-w-[360px]' : 'max-w-[900px]'}`}>
        <video
          controls
          playsInline
          preload="none"
          poster={tutorial.poster}
          width={tutorial.width}
          height={tutorial.height}
          aria-label={tutorial.title}
          className="block h-auto w-full overflow-hidden rounded-[14px] border border-border-subtle bg-frame shadow-card"
        >
          <source src={tutorial.src} type="video/mp4" />
        </video>
        <figcaption className="mt-3 text-[16px] text-muted-foreground">{tutorial.title}</figcaption>
      </figure>
    </Tray>
  );
}

/** Real screenshots of the owner app, lazy-loaded on an accent-soft panel. */
export function ScreenshotsSection({ page, inline = false }: { page: FeaturePage; inline?: boolean }) {
  const shots = page.screenshots ?? [];
  if (shots.length === 0) {
    if (!import.meta.env.DEV) return null;
    return (
      <Tray label="Screenshots" inline={inline}>
        <h2 className="display-3 text-balance">See it in the app</h2>
        <SlotPlaceholder icon={ImageIcon} title="Screenshots go here">
          Add 2 to 4 screenshots to <code className={CODE}>public/features/{page.slug}/</code>, then list them in{' '}
          <code className={CODE}>screenshots</code> for this page in <code className={CODE}>src/data/featurePages.ts</code>.
        </SlotPlaceholder>
      </Tray>
    );
  }
  return (
    <Tray label="Screenshots" inline={inline}>
      <h2 className="display-3 text-balance">See it in the app</h2>
      <div className="mt-8 grid gap-6 sm:grid-cols-[repeat(2,minmax(0,1fr))]">
        {shots.map(shot => (
          <figure key={shot.src} className="overflow-hidden rounded-[14px] border border-border-subtle bg-frame shadow-card">
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

/* ── Close ──────────────────────────────────────────────────────────────── */

export function RelatedFeatures({ page }: { page: FeaturePage }) {
  const related = page.related.map(getFeaturePage).filter((p): p is FeaturePage => !!p);
  if (related.length === 0) return null;
  return (
    <section aria-labelledby="related-title" className="bg-subtle px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <Split head={<h2 id="related-title" className="display-2 text-balance">{RELATED_HEADING}</h2>}>
          <ul className="border-t border-border-subtle">
            {related.map(p => (
              <li key={p.slug} className="row-bar border-b border-border-subtle">
                <a href={`/${p.slug}`} className="block py-6 pl-5 md:py-7 md:pl-7">
                  <h3 className="display-3 text-foreground">
                    <span className="link-grow">{p.cardTitle}</span>
                  </h3>
                  <p className="mt-2 max-w-[58ch] text-[16px] leading-relaxed text-muted-foreground">{p.cardText}</p>
                </a>
              </li>
            ))}
          </ul>
          <p className="mt-8 text-[16px] text-muted-foreground">
            <Inline text={FEATURE_OUTRO} />
          </p>
        </Split>
      </div>
    </section>
  );
}

/** The blue close with the one action. */
export function FeatureClose() {
  return (
    <section aria-labelledby="feature-close-title" className="band-accent px-5 py-20 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-[1200px] gap-10 lg:grid-cols-12 lg:items-end">
        <h2 id="feature-close-title" className="display-1 text-balance lg:col-span-8">
          Stop managing members. Start growing your gym.
        </h2>
        <div className="lg:col-span-4">
          <Magnet className="inline-block">
            <a href={APP_URL} className="btn btn-primary btn-lg">
              Start free trial
            </a>
          </Magnet>
          <p className="mt-4 text-[16px] text-muted-foreground">{FEATURE_FINEPRINT}</p>
        </div>
      </div>
    </section>
  );
}

/** Every page in the documentation, grouped as the old sidebar grouped them, plus the second search field. */
export function MoreFromGymFlow({ page }: { page: FeaturePage }) {
  // An id is taken first so the search field below keeps the useId it had before the redesign.
  useId();
  const groups: { name: string; pages: FeaturePage[] }[] = [];
  for (const p of FEATURE_PAGES) {
    const name = p.group ?? groups[groups.length - 1]?.name ?? 'Documentation';
    const last = groups[groups.length - 1];
    if (last && last.name === name) last.pages.push(p);
    else groups.push({ name, pages: [p] });
  }
  return (
    <section aria-labelledby="more-title" className="px-5 py-16 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <Split
          head={
            <>
              <h2 id="more-title" className="display-2 text-balance">More from GymFlow</h2>
              <div className="mt-6 max-w-[320px]">
                <DocsSearch />
              </div>
            </>
          }
        >
          <div className="grid gap-10">
            {groups.map(group => (
              <nav key={group.name} aria-label={group.name}>
                <p className="text-[16px] font-medium text-muted-foreground">{group.name}</p>
                <ul className="mt-2 border-t border-border-subtle">
                  {group.pages.map(p => (
                    <li key={p.slug} data-current={p.slug === page.slug} className="row-bar border-b border-border-subtle">
                      <a
                        href={`/${p.slug}`}
                        aria-current={p.slug === page.slug ? 'page' : undefined}
                        className={`block min-h-11 py-3 pl-5 text-[17px] transition-colors hover:text-accent-text ${p.slug === page.slug ? 'font-medium text-foreground' : 'text-foreground/80'}`}
                      >
                        <span className="link-grow">{docLabel(p)}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            ))}
          </div>
        </Split>
      </div>
    </section>
  );
}
