// Pure date helpers for the owner activity timeline. All output is in IST
// (Asia/Kolkata, fixed +05:30, no DST) computed by offset rather than Intl, so
// it is identical on every device and does not depend on Hermes Intl support.

const IST_OFFSET_MS = 330 * 60 * 1000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ist(iso: string | number | Date): Date {
  return new Date(new Date(iso).getTime() + IST_OFFSET_MS);
}

const p2 = (n: number) => String(n).padStart(2, '0');

/** "2026-10-29": the IST calendar day, sortable and used as the group key. */
export function dayKey(iso: string | number | Date): string {
  const d = ist(iso);
  return `${d.getUTCFullYear()}-${p2(d.getUTCMonth() + 1)}-${p2(d.getUTCDate())}`;
}

/** "Today", "Yesterday", otherwise "27 Oct 2026". */
export function dayLabel(key: string, now: Date = new Date()): string {
  if (key === dayKey(now)) return 'Today';
  if (key === dayKey(now.getTime() - 24 * 60 * 60 * 1000)) return 'Yesterday';
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

/** "12:11 am" */
export function formatTime(iso: string): string {
  const d = ist(iso);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${p2(d.getUTCMinutes())} ${h < 12 ? 'am' : 'pm'}`;
}

/** "29/10/2026, 12:11 am" */
export function formatDateTime(iso: string): string {
  const [y, m, d] = dayKey(iso).split('-');
  return `${d}/${m}/${y}, ${formatTime(iso)}`;
}

export type DaySection<T> = { key: string; label: string; data: T[] };

/** Groups events (already newest-first) into consecutive day sections. */
export function groupByDay<T extends { createdAt: string }>(
  events: T[],
  now: Date = new Date(),
): DaySection<T>[] {
  const sections: DaySection<T>[] = [];
  for (const e of events) {
    const key = dayKey(e.createdAt);
    const last = sections[sections.length - 1];
    if (last && last.key === key) last.data.push(e);
    else sections.push({ key, label: dayLabel(key, now), data: [e] });
  }
  return sections;
}
