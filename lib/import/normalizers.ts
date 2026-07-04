/**
 * lib/import/normalizers.ts
 * Single source of truth for all field normalization used in both
 * auto-import and manual-mapping import flows.
 */

import { format } from "date-fns";

export function excelSerialToDate(serial: number): string {
  return format(new Date(Math.round((serial - 25569) * 86400 * 1000)), "yyyy-MM-dd");
}

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

export function normalizePlan(raw: string): string {
  const v = raw.toLowerCase().trim().replace(/[\s\-_]+/g, "");
  if (["monthly","month","1month","1m","30days","30day","onemonth","mo","mon","mthly","mth"].includes(v)) return "monthly";
  if (["quarterly","quarter","3months","3month","3m","90days","90day","threemonths","threemonth","3mo","qtrly","qtr","q"].includes(v)) return "quarterly";
  if (["6months","6month","6m","sixmonths","sixmonth","halfyear","halfyearly","biannual","semiannual","180days","180day"].includes(v)) return "quarterly";
  if (["annual","annually","yearly","year","1year","12months","12month","12m","365days","365day","oneyear","1yr","yr","yrs","twelvemonths","twelvemonth","pa","perannum"].includes(v)) return "annual";
  const num = parseInt(v);
  if (!isNaN(num)) {
    if (num <= 1) return "monthly";
    if (num <= 8) return "quarterly";
    return "annual";
  }
  return "monthly";
}

export function isRecognizedPlan(raw: string): boolean {
  const v = raw.toLowerCase().trim().replace(/[\s\-_]+/g, "");
  if (!v) return true; // Empty plan falls back to monthly, no prompt needed
  if (["monthly","month","1month","1m","30days","30day","onemonth","mo","mon","mthly","mth"].includes(v)) return true;
  if (["quarterly","quarter","3months","3month","3m","90days","90day","threemonths","threemonth","3mo","qtrly","qtr","q"].includes(v)) return true;
  if (["6months","6month","6m","sixmonths","sixmonth","halfyear","halfyearly","biannual","semiannual","180days","180day"].includes(v)) return true;
  if (["annual","annually","yearly","year","1year","12months","12month","12m","365days","365day","oneyear","1yr","yr","yrs","twelvemonths","twelvemonth","pa","perannum"].includes(v)) return true;
  const num = parseInt(v);
  if (!isNaN(num)) return true;
  return false;
}

export function normalizeGender(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["m","male","boy","man","gents","gent","mr"].includes(v)) return "male";
  if (["f","female","girl","woman","ladies","lady","ms","mrs"].includes(v)) return "female";
  if (["o","other","others","na","n/a","prefer not to say"].includes(v)) return "other";
  return "";
}

export function normalizePaymentMode(raw: string): string {
  const v = raw.toLowerCase().trim().replace(/\s+/g, "");
  if (["cash","c","hand","inhand","bycash"].includes(v)) return "cash";
  if (["upi","gpay","googlepay","phonepay","phonepe","paytm","bhim","online","neft","imps","netbanking","transfer","banktransfer","rtgs"].includes(v)) return "upi";
  if (["card","debit","credit","debitcard","creditcard","swipe","pos","tap"].includes(v)) return "card";
  return "cash";
}

const WORD_NUMS: Record<string, number> = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,
  eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,
  sixty:60,seventy:70,eighty:80,ninety:90,
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
      return `${c.length === 4 ? c : "20" + c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
  }
  return t || format(new Date(), "yyyy-MM-dd");
}

/**
/**
 * Normalizes a member number from the import file.
 *
 * GF-prefixed IDs (e.g. "GF0042", "gf42", "GF-001") are treated as native
 * GymFlow IDs — the numeric part is extracted and checked against the DB.
 *
 * Everything else (e.g. "C1002", "MEM007", "GYM-42", "#123", plain "1002")
 * is treated as a LEGACY ID from another system. We store the raw value in
 * `legacy_member_id` and return `number: ""` so the pipeline auto-assigns a
 * fresh GymFlow ID — preventing any collision with existing members.
 *
 * Returns:
 *   number   — numeric string to use as member_number, or "" to auto-assign
 *   prefix   — detected prefix (informational only)
 *   original — raw trimmed value for legacy_member_id storage
 */
export function normalizeMemberNumber(raw: string): {
  number: string;
  prefix: string;
  original: string;
} {
  const trimmed = raw.trim();
  if (!trimmed) return { number: "", prefix: "", original: "" };

  // GF-prefixed → native GymFlow ID, extract the number
  const gfMatch = trimmed.match(/^[Gg][Ff][-_\s]?(\d+)/);
  if (gfMatch) {
    const number = String(parseInt(gfMatch[1], 10));
    return { number, prefix: "GF", original: trimmed };
  }

  // Anything else (C1002, MEM007, GYM-42, plain 1002, #123, etc.)
  // → treat as legacy ID from another system, always auto-assign a new GF ID
  return { number: "", prefix: "", original: trimmed };
}
