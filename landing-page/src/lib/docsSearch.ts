import { FEATURE_CARDS, FEATURE_PAGES, docLabel, parseInline, sectionIds, type FeatureBlock } from '../data/featurePages';

/* Documentation search: a plain in-memory scan over the feature data (a dozen sections, a few
   thousand words), so there is no index file, no library and no network. Built on first use. */

interface Entry {
  slug: string;
  pageLabel: string;
  heading: string;
  id: string;
  text: string;
}

export interface SearchResult extends Entry {
  /** The snippet cut into runs; `hit` runs are the matched words. */
  snippet: { text: string; hit: boolean }[];
}

// The data's own parser strips the **bold** and [link](href) markup, so it is never reimplemented here.
const plain = (text: string) => parseInline(text).map(node => node.text).join('');

function blockText(block: FeatureBlock): string {
  switch (block.type) {
    case 'p':
    case 'h3':
    case 'note':
      return plain(block.text);
    case 'ul':
    case 'ol':
      return block.items.map(plain).join(' ');
    case 'features':
      return FEATURE_CARDS.map(card => `${card.cardTitle} ${card.cardText}`).join(' ');
  }
}

let index: Entry[] | undefined;
function getIndex(): Entry[] {
  index ??= FEATURE_PAGES.flatMap(page => {
    const ids = sectionIds(page);
    return page.sections.map((section, i) => ({
      slug: page.slug,
      pageLabel: docLabel(page),
      heading: section.heading,
      id: ids[i],
      text: section.blocks.map(blockText).join(' '),
    }));
  });
  return index;
}

const escapeRe = (word: string) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function snippetFor(text: string, words: string[]): SearchResult['snippet'] {
  const lower = text.toLowerCase();
  const found = words.map(w => lower.indexOf(w)).filter(i => i >= 0);
  const at = found.length ? Math.min(...found) : 0;
  const start = Math.max(0, at - 40);
  const slice = `${start > 0 ? '…' : ''}${text.slice(start, start + 130)}${start + 130 < text.length ? '…' : ''}`;
  const re = new RegExp(`(${words.map(escapeRe).join('|')})`, 'gi');
  return slice
    .split(re)
    // A capturing split puts the matches at the odd positions.
    .map((text, i) => ({ text, hit: i % 2 === 1 }))
    .filter(part => part.text);
}

/** Every word must appear somewhere in the section; headings and page names rank above body text. */
export function searchDocs(query: string, limit = 8): SearchResult[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  return getIndex()
    .map(entry => {
      const heading = entry.heading.toLowerCase();
      const page = entry.pageLabel.toLowerCase();
      const body = entry.text.toLowerCase();
      let score = 0;
      for (const w of words) {
        const s = (heading.includes(w) ? 3 : 0) + (page.includes(w) ? 2 : 0) + (body.includes(w) ? 1 : 0);
        if (s === 0) return null;
        score += s;
      }
      return { entry, score };
    })
    .filter((r): r is { entry: Entry; score: number } => r !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry }) => ({ ...entry, snippet: snippetFor(entry.text, words) }));
}
