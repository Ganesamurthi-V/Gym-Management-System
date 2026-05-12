/**
 * lib/import/normalizers.ts
 * ─────────────────────────
 * Single source of truth for all field normalization used in both
 * auto-import and manual-mapping import flows.
 *
 * ADD NEW NORMALIZERS HERE — they will automatically apply to both flows.
 */

import { format } from "date-fns";

// ── Cell value → string ───────────────────────────────────────────────────────

export function excelSerialToDate(serial: number): string {
  return format(new Date(Math.round((serial - 25569) * 86400 * 1000)), "yyyy-MM-dd");
}

/** Safely coerce any ExcelJS CellValue to a trimmed string. */
export function cellStr(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object" && "richText" in (value as object))
    return ((value as { richText: { text: string }[] }).richText).map(r => r.text).join("").trim();
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  if (typeof value === "object" && "result" in (value as object))
    return cellStr((value as { result: unknown }).result);
  return String(value).trim();
}

// ── Plan ──────────────────────────────────────────────────────────────────────

/**
 * Normalizes any membership plan string to one of: monthly | quarterly | annual
 *
 * Covers common abbreviations, durations, and regional variants.
 * Add new aliases here — both import flows pick them up automatically.
 */
export function normalizePlan(raw: string): string {
  const v = raw.toLowerCase().trim().replace(/[\s\-_]+/g, "");

  // ── Monthly ──────────────────────────────────────────────────────────────
  if ([
    "monthly", "month", "1month", "1m", "30days", "30day",
    "onemonth", "mo", "mon", "mthly", "mth",
  ].includes(v)) return "monthly";

  // ── Quarterly (3 months) ─────────────────────────────────────────────────
  if ([
    "quarterly", "quarter", "3months", "3month", "3m", "90days", "90day",
    "threemonths", "threemonth", "3mo", "qtrly", "qtr", "q",
    // "6 months" is NOT quarterly — handled below as semi-annual
  ].includes(v)) return "quarterly";

  // ── Semi-annual (6 months) → map to quarterly as closest plan ────────────
  // If your DB supports a "semi_annual" plan, change the return value here.
  if ([
    "6months", "6month", "6m", "sixmonths", "sixmonth",
    "halfyear", "halfyearly", "biannual", "semiannual", "180days", "180day",
  ].includes(v)) return "quarterly";

  // ── Annual (12 months) ───────────────────────────────────────────────────
  if ([
    "annual", "annually", "yearly", "year", "1year", "12months", "12month",
    "12m", "365days", "365day", "oneyear", "1yr", "yr", "yrs",
    "twelvemonths", "twelvemonth", "pa", "perannum",
  ].includes(v)) return "annual";

  // ── Numeric duration fallback (e.g. "3", "12") ───────────────────────────
  const num = parseInt(v);
  if (!isNaN(num)) {
    if (num <= 1)  return "monthly";
    if (num <= 4)  return "quarterly";
    if (num <= 8)  return "quarterly";   // 5–8 months → quarterly
    return "annual";                      // 9+ months → annual
  }

  return "monthly"; // safe default
}

// ── Gender ────────────────────────────────────────────────────────────────────

export function normalizeGender(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["m", "male", "boy", "man", "gents", "gent", "mr"].includes(v)) return "male";
  if (["f", "female", "girl", "woman", "ladies", "lady", "ms", "mrs"].includes(v)) return "female";
  if (["o", "other", "others", "na", "n/a", "prefer not to say"].includes(v)) return "other";
  return "";
}

// ── Payment mode ──────────────────────────────────────────────────────────────

export function normalizePaymentMode(raw: string): string {
  const v = raw.toLowerCase().trim().replace(/\s+/g, "");
  if (["cash", "c", "hand", "inhand", "bycash"].includes(v)) return "cash";
  if ([
    "upi", "gpay", "googlepay", "phonepay", "phonepe", "paytm",
    "bhim", "online", "neft", "imps", "netbanking", "transfer",
    "banktransfer", "rtgs",
  ].includes(v)) return "upi";
  if ([
    "card", "debit", "credit", "debitcard", "creditcard",
    "swipe", "pos", "tap",
  ].includes(v)) return "card";
  return "cash";
}

// ── Age ───────────────────────────────────────────────────────────────────────

const WORD_NUMS: Record<string, number> = {
  zero:0, one:1, two:2, three:3, four:4, five:5, six:6, seven:7, eight:8, nine:9, ten:10,
  eleven:11, twelve:12, thirteen:13, fourteen:14, fifteen:15, sixteen:16, seventeen:17,
  eighteen:18, nineteen:19, twenty:20, thirty:30, forty:40, fifty:50,
  sixty:60, seventy:70, eighty:80, ninety:90,
};

export function normalizeAge(raw: string): string {
  if (!raw) return "";
  const cleaned = raw.toLowerCase().replace(/\s*(years?|yrs?|y)\b/g, "").trim();
  const num = parseInt(cleaned);
  if (!isNaN(num) && num > 0 && num <= 120) return String(num);
  const words = cleaned.replace(/-/g, " ").split(/\s+/);
  let total = 0;
  for (const w of words) {
    const n = WORD_NUMS[w];
    if (n === undefined) return "";
    total += n;
  }
  return total > 0 && total <= 120 ? String(total) : "";
}

// ── Date ──────────────────────────────────────────────────────────────────────

export function normalizeDate(raw: string): string {
  const t = raw.trim();
  const isoMatch = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (isoMatch) return isoMatch[1];
  const n = Number(t);
  if (!isNaN(n) && t !== "" && !t.includes("-") && !t.includes("/"))
    return excelSerialToDate(n);
  if (t.includes("/")) {
    const parts = t.split("/");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      return `${c.length === 4 ? c : `20${c}`}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
  }
  return t || format(new Date(), "yyyy-MM-dd");
}
