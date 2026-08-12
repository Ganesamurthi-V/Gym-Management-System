/**
 * lib/import/pipeline.ts
 * ──────────────────────
 * Shared post-parse pipeline for both auto-import and manual-mapping import.
 *
 * Stages (in order):
 *   1. Plan price auto-fill      — fills amount=0 rows from gym_plan_prices table
 *   2. Member ID assignment      — auto-assigns IDs, flags conflicts
 *
 * ADD NEW PIPELINE STAGES HERE — both import flows pick them up automatically.
 */

import type { ImportedRow } from "@/app/owner/import/page";

export interface PipelineOptions {
  /** Callback to report progress stage (optional) */
  onStage?: (stage: "prices" | "ids") => void;
}

export interface PipelineResult {
  rows: ImportedRow[];
  clusterInfo: null;
}

/**
 * Run the full import pipeline on a list of pre-parsed rows.
 * Mutates rows in-place for performance, then returns them.
 */
export async function runImportPipeline(
  parsed: ImportedRow[],
  options: PipelineOptions = {}
): Promise<PipelineResult> {
  const { onStage } = options;

  // ── Stage 1: Plan price auto-fill ─────────────────────────────────────────
  // Fetched through our own API instead of querying `gyms` + `gym_plan_prices`
  // directly from the browser. `hasGym` stands in for the old gym lookup: the
  // route resolves the gym from the session, so a non-2xx response means there
  // is no usable gym context and ID assignment is skipped exactly as before.
  onStage?.("prices");
  let planPrices: Record<string, number> = {};
  let hasGym = false;

  try {
    const res = await fetch("/api/import/plan-prices");
    if (res.ok) {
      hasGym = true;
      const json = await res.json();
      const prices = json?.data?.plan_prices;
      if (prices) {
        planPrices = {
          monthly:   prices.monthly   ?? 0,
          quarterly: prices.quarterly ?? 0,
          annual:    prices.annual    ?? 0,
        };
      }
    }
  } catch {
    // Network failure — fall through with empty prices, same as a gym with no
    // gym_plan_prices row. Rows keep whatever amount the file supplied.
  }

  parsed.forEach(r => {
    const rawAmt = parseInt(r.amount);
    if (!r.amount || isNaN(rawAmt) || rawAmt === 0) {
      r.amount = String(planPrices[r.plan] ?? 0);
    }
  });

  // ── Stage 2: ID assignment + phone dedup ──────────────────────────────────
  onStage?.("ids");

  // Collect explicit numbers the file contains
  const requestedNums = parsed
    .map((r) => parseInt(r.member_number))
    .filter((n) => !isNaN(n) && n > 0)

  let nextId = 1
  let conflictingNums = new Set<number>()

  if (hasGym) {
    const idRes = await fetch(
      `/api/import/next-member-id?${new URLSearchParams({
        ...(requestedNums.length > 0 && { requested: requestedNums.join(',') }),
      })}`,
    ).then(r => r.ok
      ? r.json() as Promise<{ next_id: number; conflicts: number[] }>
      : null
    )

    if (idRes) {
      nextId           = idRes.next_id
      conflictingNums  = new Set(idRes.conflicts)
    }
  }

  // ID assignment — always start from nextId (above current DB max)
  const assignedNums = new Set<number>()

  function nextAvailable(): number {
    while (assignedNums.has(nextId) || conflictingNums.has(nextId)) nextId++
    const id = nextId++
    assignedNums.add(id)
    return id
  }

  // Track numbers claimed within this file for intra-file dedup
  const usedInFile = new Set<number>()

  parsed.forEach((r) => {
    if (r._status === 'error' || r._status === 'duplicate') return

    const parsedNum = parseInt(r.member_number)
    const hasExplicitNum = !isNaN(parsedNum) && parsedNum > 0

    if (!hasExplicitNum) {
      const newNum = nextAvailable()
      r.member_number = String(newNum)
      r._id_auto = true
    } else {
      const inDB   = conflictingNums.has(parsedNum)
      const inFile = usedInFile.has(parsedNum)

      if (inDB || inFile) {
        if (!r.legacy_member_id) {
          r.legacy_member_id = `GF${parsedNum.toString().padStart(4, '0')}`
        }
        const newNum = nextAvailable()
        r._error = `ID GF${parsedNum.toString().padStart(4, '0')} ${inDB ? 'exists in DB' : 'duplicate in file'} — auto-assigned GF${newNum.toString().padStart(4, '0')}`
        r.member_number = String(newNum)
        r._id_auto = true
        r._id_conflict = false
      } else {
        usedInFile.add(parsedNum)
        if (parsedNum >= nextId) nextId = parsedNum + 1
      }
    }

    const finalNum = parseInt(r.member_number)
    if (!isNaN(finalNum)) usedInFile.add(finalNum)
  })

  return { rows: parsed, clusterInfo: null };
}
