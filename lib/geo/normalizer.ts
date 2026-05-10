/** Lowercase, strip non-alphanumeric, collapse spaces */
export function normalizeInput(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/ /g, '')
}

/** Phonetic key — collapse sound-alike patterns (ported from lib/areas.ts) */
export function toPhoneticKey(normalized: string): string {
  return normalized
    .replace(/ph/g, 'f')
    .replace(/ck/g, 'k')
    .replace(/([aeiou])\1+/g, '$1')
    .replace(/([^aeiou])\1+/g, '$1')
    .replace(/yan/g, 'an')
    .replace(/iya/g, 'ia')
    .replace(/ea/g, 'e')
    .replace(/ou/g, 'u')
    .replace(/[aeiou]+$/, '')
}

const ABBREVIATION_MAP: Record<string, string> = {
  'tnagar':   'tnagar',
  'tnagr':    'tnagar',
  'annanagr': 'annanagar',
  'annangr':  'annanagar',
}

/** Expand known abbreviations before matching */
export function expandAbbreviations(input: string): string {
  return ABBREVIATION_MAP[input] ?? input
}
