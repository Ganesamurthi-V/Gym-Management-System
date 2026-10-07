/**
 * The reply editor's formatting, as pure functions.
 *
 * The editor is a plain text box whose toolbar inserts markers around the selection, and
 * gymflow-admin (lib/email-format.ts) turns the same markers into the HTML the recipient
 * sees. Keep the two grammars in step:
 *
 *   **bold**   _italic_   ++underline++   [text](https://url)
 *   a line starting "• " or "- "  → bullet      a line starting "1. " → numbered
 */

export type Selection = { start: number; end: number };
export type Edit = { text: string; selection: Selection };

/** Wraps the selection in a marker pair, or removes the pair when it is already there. */
export function toggleWrap(text: string, sel: Selection, open: string, close = open): Edit {
  const { start, end } = sel;

  // Already wrapped just outside the selection: unwrap.
  if (text.slice(start - open.length, start) === open && text.slice(end, end + close.length) === close && start !== end) {
    return {
      text: text.slice(0, start - open.length) + text.slice(start, end) + text.slice(end + close.length),
      selection: { start: start - open.length, end: end - open.length },
    };
  }
  // Already wrapped inside the selection: unwrap.
  const picked = text.slice(start, end);
  if (picked.length >= open.length + close.length && picked.startsWith(open) && picked.endsWith(close)) {
    const inner = picked.slice(open.length, picked.length - close.length);
    return { text: text.slice(0, start) + inner + text.slice(end), selection: { start, end: start + inner.length } };
  }

  // Nothing selected: drop an empty pair and leave the cursor between the markers.
  if (start === end) {
    return {
      text: text.slice(0, start) + open + close + text.slice(end),
      selection: { start: start + open.length, end: start + open.length },
    };
  }
  return {
    text: text.slice(0, start) + open + picked + close + text.slice(end),
    selection: { start: start + open.length, end: end + open.length },
  };
}

/** Start and end offsets of every line the selection touches. */
function lineSpan(text: string, sel: Selection): { from: number; to: number } {
  const from = text.lastIndexOf('\n', Math.max(0, sel.start) - 1) + 1;
  const nl = text.indexOf('\n', sel.end);
  return { from, to: nl === -1 ? text.length : nl };
}

const BULLET_RE = /^\s*[-*•✦]\s+/;
const NUMBER_RE = /^\s*\d{1,2}[.)]\s+/;

/** Turns the touched lines into a bullet or numbered list, or back into plain lines. */
export function toggleList(text: string, sel: Selection, kind: 'bullet' | 'number'): Edit {
  const { from, to } = lineSpan(text, sel);
  const lines = text.slice(from, to).split('\n');
  const re = kind === 'bullet' ? BULLET_RE : NUMBER_RE;
  const allOn = lines.every(l => l.trim() === '' || re.test(l));

  const next = lines.map((line, i) => {
    if (line.trim() === '') return line;
    const bare = line.replace(BULLET_RE, '').replace(NUMBER_RE, '');
    if (allOn) return bare;
    return kind === 'bullet' ? `• ${bare}` : `${i + 1}. ${bare}`;
  });
  const replaced = next.join('\n');
  return {
    text: text.slice(0, from) + replaced + text.slice(to),
    selection: { start: from, end: from + replaced.length },
  };
}

/** Inserts [label](url) at the selection, using the selected words as the label if none given. */
export function insertLink(text: string, sel: Selection, label: string, url: string): Edit {
  const shown = (label.trim() || text.slice(sel.start, sel.end) || url).trim();
  const md = `[${shown}](${url.trim()})`;
  return {
    text: text.slice(0, sel.start) + md + text.slice(sel.end),
    selection: { start: sel.start + md.length, end: sel.start + md.length },
  };
}

/** http(s) and mailto only, so a pasted javascript: address never becomes a link. */
export function normalizeUrl(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^(https?:\/\/|mailto:)\S+$/i.test(v)) return v;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `mailto:${v}`;
  if (/^[^\s/]+\.[^\s/]{2,}(\/\S*)?$/.test(v)) return `https://${v}`;
  return null;
}

// ── Preview: the same markers drawn as styled text ─────────────────────────────────────────

export type Run = { text: string; bold?: boolean; italic?: boolean; underline?: boolean; href?: string };
export type Block = { kind: 'p' | 'bullet' | 'number'; index?: number; runs: Run[] };

const INLINE = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*(.+?)\*\*|\+\+(.+?)\+\+|(^|[^\w])_(.+?)_(?![\w])|(https?:\/\/[^\s<)]+)/g;

export function parseInline(line: string): Run[] {
  const runs: Run[] = [];
  let last = 0;
  line.replace(INLINE, (m: string, label, url, bold, under, pre, italic, bare, offset: number) => {
    const lead = pre ? pre.length : 0;
    if (offset + lead > last) runs.push({ text: line.slice(last, offset + lead) });
    if (label !== undefined) runs.push({ text: label, href: normalizeUrl(url) ?? undefined, underline: !!normalizeUrl(url) });
    else if (bold !== undefined) runs.push({ text: bold, bold: true });
    else if (under !== undefined) runs.push({ text: under, underline: true });
    else if (italic !== undefined) runs.push({ text: italic, italic: true });
    else if (bare !== undefined) runs.push({ text: bare, href: bare, underline: true });
    last = offset + m.length;
    return m;
  });
  if (last < line.length) runs.push({ text: line.slice(last) });
  return runs.length ? runs : [{ text: '' }];
}

export function parseBlocks(markup: string): Block[] {
  const blocks: Block[] = [];
  let n = 0;
  for (const raw of markup.replace(/\r\n/g, '\n').split('\n')) {
    if (BULLET_RE.test(raw)) {
      blocks.push({ kind: 'bullet', runs: parseInline(raw.replace(BULLET_RE, '')) });
      n = 0;
    } else if (NUMBER_RE.test(raw)) {
      n += 1;
      blocks.push({ kind: 'number', index: n, runs: parseInline(raw.replace(NUMBER_RE, '')) });
    } else {
      n = 0;
      blocks.push({ kind: 'p', runs: parseInline(raw) });
    }
  }
  return blocks;
}
