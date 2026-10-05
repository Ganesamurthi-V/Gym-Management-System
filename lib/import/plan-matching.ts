/**
 * lib/import/plan-matching.ts
 * ───────────────────────────
 * Deterministic matching for the "plan" column of an imported sheet. No model,
 * no network: the same cell always gives the same answer.
 *
 * Two different questions are answered here, and they are kept apart on purpose:
 *
 *   1. recognizePlanDuration — does this cell SAY how long the plan runs?
 *      "Monthly", "montly", "3 mnths", "Gold - 1 Year", "90 days" all do.
 *      The answer is used without asking the owner, so it only fires on
 *      evidence that is explicit in the text. Anything else returns null.
 *
 *   2. groupPlanNames — which of the remaining cells are the SAME name?
 *      "Gold" / "gold" / "GOLD PLAN", "Platinum" / "Platinam", "Basic" / "Basik".
 *      A tier name carries no duration, so the owner still chooses one — but once
 *      per name instead of once per spelling.
 *
 * A wrong merge is worse than a missed one (it gives a member the wrong expiry
 * date), so every rule below is biased towards NOT matching: short words, words
 * with digits and single letters ("Plan A" / "Plan B", "Gold 1" / "Gold 2",
 * "VIP" / "VVIP") must agree exactly.
 */

export type PlanDuration = "monthly" | "quarterly" | "annual";

// ── Text folding ─────────────────────────────────────────────────────────────

const DECIMAL = "\u0001";

/** Lower-case words and numbers, with accents, punctuation and spacing removed. */
function tokenize(raw: string): string[] {
  const folded = raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\+/g, " plus ")
    .replace(/([a-z])[.'’`](?=[a-z])/g, "$1")          // v.i.p → vip
    .replace(/(\d)\.(?=\d)/g, `$1${DECIMAL}`)          // keep the point in 1.5
    .replace(/([a-z])(?=\d)/g, "$1 ")                  // gold1 → gold 1
    .replace(/(\d)(?=[a-z])/g, "$1 ")                  // 3months → 3 months
    .replace(new RegExp(`[^a-z0-9${DECIMAL}]+`, "g"), " ")
    .replace(new RegExp(DECIMAL, "g"), ".")
    .trim();
  return folded ? folded.split(" ") : [];
}

// ── Word similarity ──────────────────────────────────────────────────────────

/**
 * Edit distance counting an adjacent swap as one edit (optimal string alignment),
 * which is what a typing slip actually is: "sliver" is one mistake, not two.
 */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let prev2: number[] = [];
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const row = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let best = Math.min(prev[j] + 1, row[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        best = Math.min(best, prev2[j - 2] + 1);
      }
      row.push(best);
    }
    prev2 = prev;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How a word sounds, roughly: its consonants in order. Two spellings of one word
 * share it ("platinum" / "pletinam" → pltnm) while two different words that
 * happen to be two letters apart do not ("weekdays" wkds / "weekends" wknds).
 */
function skeleton(word: string): string {
  const sounded = word
    .replace(/ph/g, "f")
    .replace(/ck/g, "k")
    .replace(/c(?=[eiy])/g, "s")
    .replace(/[cq]/g, "k")
    .replace(/z/g, "s")
    .replace(/x/g, "ks");
  return (sounded[0] + sounded.slice(1).replace(/[aeiouyhw]/g, "")).replace(/(.)\1+/g, "$1");
}

function isAdjacentSwap(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const i = [...a].findIndex((ch, k) => ch !== b[k]);
  return i >= 0 && i < a.length - 1 && a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2);
}

/**
 * Are two words the same word, allowing for a typing or spelling mistake?
 *
 *   · anything with a digit, or 1–2 letters long: must be identical
 *   · different first letter: never ("royal" / "loyal", "night" / "light")
 *   · up to 4 letters: only two swapped neighbours ("glod"). One changed letter in
 *     a short word is usually a different word ("pro" / "pre", "vip" / "vvip").
 *   · 5 letters or more: one edit
 *   · two edits: only when the words also sound alike. `closedVocabulary` relaxes
 *     this for the handful of duration words, where there is nothing else nearby
 *     for a long misspelling to be ("quartly" can only be "quarterly").
 */
function sameWord(a: string, b: string, closedVocabulary = false): boolean {
  if (a === b) return true;
  if (/\d/.test(a) || /\d/.test(b)) return false;
  const longest = Math.max(a.length, b.length);
  if (Math.min(a.length, b.length) <= 2 || a[0] !== b[0]) return false;
  if (longest <= 4) return isAdjacentSwap(a, b);
  const distance = editDistance(a, b);
  if (distance <= 1) return true;
  if (distance === 2) return skeleton(a) === skeleton(b) || (closedVocabulary && longest >= 8);
  return false;
}

// ── 1. Durations ─────────────────────────────────────────────────────────────

/**
 * The exact spellings the importer has always accepted, compared with every
 * space, dash and underscore removed. Kept verbatim so no sheet that imported
 * cleanly before starts asking questions now.
 */
const EXACT: Record<PlanDuration, string[]> = {
  monthly: ["monthly", "month", "1month", "1m", "30days", "30day", "onemonth", "mo", "mon", "mthly", "mth"],
  quarterly: [
    "quarterly", "quarter", "3months", "3month", "3m", "90days", "90day", "threemonths", "threemonth", "3mo", "qtrly", "qtr", "q",
    // There is no half-yearly plan to import into; six months has always landed on quarterly.
    "6months", "6month", "6m", "sixmonths", "sixmonth", "halfyear", "halfyearly", "biannual", "semiannual", "180days", "180day",
  ],
  annual: ["annual", "annually", "yearly", "year", "1year", "12months", "12month", "12m", "365days", "365day", "oneyear", "1yr", "yr", "yrs", "twelvemonths", "twelvemonth", "pa", "perannum"],
};
const EXACT_LOOKUP = new Map<string, PlanDuration>(
  (Object.keys(EXACT) as PlanDuration[]).flatMap(plan => EXACT[plan].map(text => [text, plan] as [string, PlanDuration])),
);

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};

/** Length of one unit, in months. */
const UNITS: Record<string, number> = {
  d: 1 / 30, day: 1 / 30, days: 1 / 30,
  w: 7 / 30, wk: 7 / 30, wks: 7 / 30, week: 7 / 30, weeks: 7 / 30,
  m: 1, mo: 1, mos: 1, mon: 1, mth: 1, mths: 1, mnth: 1, mnths: 1, month: 1, months: 1, monthly: 1,
  quarter: 3, quarters: 3,
  y: 12, yr: 12, yrs: 12, year: 12, years: 12, yearly: 12, annum: 12,
};
const FUZZY_UNITS = ["days", "weeks", "month", "months", "years"];

/** Words that state a duration by themselves, in months. Misspellings of these match. */
const KEYWORDS: Record<string, number> = {
  monthly: 1, month: 1, months: 1, mthly: 1, mnthly: 1,
  quarterly: 3, quarter: 3, qtrly: 3,
  halfyearly: 6, halfyear: 6, semiannual: 6, biannual: 6,
  annual: 12, annually: 12, yearly: 12, year: 12, years: 12, annum: 12,
  biennial: 24,
};
/** Abbreviations too short to trust inside a longer name ("Mon–Fri batch"). */
const ABBREVIATIONS: Record<string, number> = { m: 1, mo: 1, mon: 1, mth: 1, q: 3, qtr: 3, hy: 6, y: 12, yr: 12, yrs: 12, pa: 12 };

const FILLER = new Set([
  "plan", "plans", "membership", "memberships", "member", "package", "pack", "subscription", "scheme",
  "gym", "fee", "fees", "per", "for", "of", "the", "a", "only", "validity", "duration", "period", "type",
]);

function numberOf(token: string): number | null {
  if (/^\d+(\.\d+)?$/.test(token)) return Number(token);
  return NUMBER_WORDS[token] ?? null;
}

function unitMonths(token: string): number | null {
  if (token in UNITS) return UNITS[token];
  const near = FUZZY_UNITS.find(unit => sameWord(token, unit, true));
  return near ? UNITS[near] : null;
}

function keywordMonths(token: string): number | null {
  if (token in KEYWORDS) return KEYWORDS[token];
  let best: { months: number; distance: number } | null = null;
  for (const word of Object.keys(KEYWORDS)) {
    if (!sameWord(token, word, true)) continue;
    const distance = editDistance(token, word);
    if (!best || distance < best.distance) best = { months: KEYWORDS[word], distance };
  }
  return best ? best.months : null;
}

/**
 * Buckets follow the importer's long-standing rule: up to a month and a half is
 * monthly, up to eight months is quarterly, longer is annual. A day or week pass
 * is not a monthly plan, so anything under four weeks is left for the owner.
 */
function bucket(months: number): PlanDuration | null {
  if (!(months >= 0.9) || months > 60) return null;
  if (months <= 1.5) return "monthly";
  if (months <= 8) return "quarterly";
  return "annual";
}

/** A cell holding nothing but a number: a count of months, or a count of days. */
function bareNumber(n: number): PlanDuration | null {
  if (n <= 24) return bucket(n);
  if (n >= 28 && n <= 31) return "monthly";
  if ((n >= 84 && n <= 93) || (n >= 180 && n <= 186)) return "quarterly";
  if (n >= 360 && n <= 366) return "annual";
  return null; // "2500" in the plan column is a price, not a plan
}

/**
 * The plan length a cell states, or null when it does not state one.
 *
 * Reads, in order of trust: a number with a unit ("3 months", "90 days",
 * "six month", "1yr"), then duration words including misspellings ("montly",
 * "quaterly", "anual"), then — only when nothing else is in the cell — an
 * abbreviation ("qtr") or a bare number. If the cell states two different
 * lengths ("1 year 6 months") it returns null rather than pick one.
 */
export function recognizePlanDuration(raw: string): PlanDuration | null {
  const tokens = tokenize(raw);
  if (tokens.length === 0) return null;

  const exact = EXACT_LOOKUP.get(tokens.join(""));
  if (exact) return exact;

  // "3+1 months", "12 + 2 months free": the member gets the total.
  for (let i = 0; i + 2 < tokens.length; i++) {
    const a = numberOf(tokens[i]);
    const b = numberOf(tokens[i + 2]);
    if (a !== null && b !== null && tokens[i + 1] === "plus") {
      tokens.splice(i, 3, String(a + b));
      i--;
    }
  }

  const stated: (PlanDuration | null)[] = [];
  const abbreviated: number[] = [];
  const loneNumbers: number[] = [];
  let unexplained = 0;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const next = tokens[i + 1];

    const n = numberOf(token);
    if (n !== null) {
      const unit = next === undefined ? null : unitMonths(next);
      if (unit !== null) { stated.push(bucket(n * unit)); i++; } else loneNumbers.push(n);
      continue;
    }
    // "half yearly", "semi annual", "bi-annual" are six months, not a year.
    if ((token === "half" || token === "semi" || token === "bi") && next !== undefined) {
      const following = keywordMonths(next);
      if (following !== null) { stated.push(following === 12 ? bucket(6) : null); i++; continue; }
    }
    if (FILLER.has(token)) continue;
    if (token in ABBREVIATIONS) { abbreviated.push(ABBREVIATIONS[token]); continue; }
    const months = keywordMonths(token);
    if (months !== null) { stated.push(bucket(months)); continue; }
    unexplained++;
  }

  let found = stated;
  if (found.length === 0 && unexplained === 0) {
    if (abbreviated.length > 0) found = abbreviated.map(bucket);
    else if (loneNumbers.length === 1) found = [bareNumber(loneNumbers[0])];
  }
  if (found.length === 0 || found.includes(null)) return null;
  return found.every(plan => plan === found[0]) ? found[0] : null;
}

// ── 2. Plan names ────────────────────────────────────────────────────────────

/** Words that do not distinguish one plan name from another: "Gold Plan" is "Gold". */
const NAME_FILLER = new Set(["plan", "plans", "membership", "memberships", "member", "package", "pack", "subscription", "scheme", "the"]);

/**
 * Names gyms commonly give their tiers. Used only to choose which spelling in a
 * group is shown as its label — never to decide whether two names match.
 */
const COMMON_NAMES = new Set([
  "basic", "standard", "regular", "classic", "bronze", "silver", "gold", "platinum", "diamond", "titanium", "premium",
  "elite", "vip", "pro", "prime", "royal", "student", "couple", "family", "ladies", "gents", "general", "personal",
  "training", "cardio", "strength", "morning", "evening", "weekend", "trial",
]);

function nameKey(raw: string): string {
  const tokens = tokenize(raw);
  const meaningful = tokens.filter(token => !NAME_FILLER.has(token));
  return (meaningful.length > 0 ? meaningful : tokens).join(" ");
}

function sameName(a: string, b: string): boolean {
  if (a === b || a.replace(/ /g, "") === b.replace(/ /g, "")) return true; // "Gold Plus" / "GoldPlus"
  const wordsA = a.split(" ");
  const wordsB = b.split(" ");
  return wordsA.length === wordsB.length && wordsA.every((word, i) => sameWord(word, wordsB[i]));
}

export interface PlanNameGroup {
  /** The spelling shown for the group: its most frequent one. */
  label: string;
  /** Every spelling in the group exactly as it appears in the file, most frequent first. */
  variants: { raw: string; count: number }[];
  /** Rows in the file using any of the spellings. */
  count: number;
}

/**
 * Collects spellings of the same plan name. `counts` maps each distinct cell
 * value to the number of rows that use it.
 *
 * Each spelling is compared with the main spelling of a group, not with every
 * member of it, so a chain of small differences (A≈B, B≈C, A≉C) cannot pull two
 * unrelated names together. Groups are seeded from the most frequent spelling
 * down, on the assumption that the correct spelling is the common one.
 */
export function groupPlanNames(counts: Record<string, number>): PlanNameGroup[] {
  const byKey = new Map<string, { raw: string; count: number }[]>();
  for (const [raw, count] of Object.entries(counts)) {
    const key = nameKey(raw);
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), { raw, count }]);
  }

  const total = (variants: { count: number }[]) => variants.reduce((sum, variant) => sum + variant.count, 0);
  const keys = [...byKey.keys()].sort((a, b) =>
    total(byKey.get(b)!) - total(byKey.get(a)!)
    || Number(COMMON_NAMES.has(b)) - Number(COMMON_NAMES.has(a))
    || a.localeCompare(b));

  const groups: { key: string; variants: { raw: string; count: number }[] }[] = [];
  for (const key of keys) {
    const home = groups.find(group => sameName(group.key, key));
    if (home) home.variants.push(...byKey.get(key)!);
    else groups.push({ key, variants: [...byKey.get(key)!] });
  }

  const capitalised = (text: string) => /^[A-Z]/.test(text);
  return groups
    .map(group => {
      const isMain = (variant: { raw: string }) => nameKey(variant.raw) === group.key;
      const variants = [...group.variants].sort((a, b) =>
        Number(isMain(b)) - Number(isMain(a))
        || b.count - a.count
        || Number(capitalised(b.raw)) - Number(capitalised(a.raw))
        || a.raw.localeCompare(b.raw));
      return { label: variants[0].raw, variants, count: total(variants) };
    })
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}
