/**
 * lib/import/pipeline.ts
 * ──────────────────────
 * Shared post-parse pipeline for both auto-import and manual-mapping import.
 *
 * Stages (in order):
 *   1. Area batch normalization  — calls /api/geo/batch-normalize
 *   2. Cluster detection         — calls /api/geo/cluster-detect (best-effort)
 *   3. Plan price auto-fill      — fills amount=0 rows from gym_plan_prices table
 *   4. Phone dedup (in-file)     — marks duplicate phones within the upload
 *   5. Member ID assignment      — auto-assigns IDs, flags conflicts
 *   6. DB phone conflict check   — marks phones already in the database
 *
 * ADD NEW PIPELINE STAGES HERE — both import flows pick them up automatically.
 */

import { matchAreaBatch } from "@/lib/geo/matchArea";
import { normalizePlan } from "./normalizers";
import type { ImportedRow } from "@/app/import/page";
import type { SupabaseClient } from "@supabase/supabase-js";

const BATCH_SIZE = 50;

export interface PipelineOptions {
  supabase: SupabaseClient;
  /** Callback to report progress stage (optional) */
  onStage?: (stage: "areas" | "cluster" | "prices" | "ids") => void;
}

export interface PipelineResult {
  rows: ImportedRow[];
  clusterInfo: { top_district: string; top_state: string; confidence: number } | null;
}

/**
 * Run the full import pipeline on a list of pre-parsed rows.
 * Mutates rows in-place for performance, then returns them.
 */
export async function runImportPipeline(
  parsed: ImportedRow[],
  options: PipelineOptions
): Promise<PipelineResult> {
  const { supabase, onStage } = options;

  // ── Resolve gym ───────────────────────────────────────────────────────────
  const { data: { user } } = await supabase.auth.getUser();
  const { data: gym } = user
    ? await supabase.from("gyms").select("id").eq("owner_id", user.id).single()
    : { data: null };

  // ── Stage 1: Area batch normalization ─────────────────────────────────────
  onStage?.("areas");
  const areaInputs = parsed.map(r => ({ raw: r.area, gymId: gym?.id }));
  const areaResults: any[] = [];
  for (let i = 0; i < areaInputs.length; i += BATCH_SIZE) {
    const batch = await matchAreaBatch(areaInputs.slice(i, i + BATCH_SIZE));
    areaResults.push(...batch);
  }
  parsed.forEach((r, i) => {
    const res = areaResults[i];
    if (res) {
      r.area = res.normalized_value;
      r._area_confidence = res.confidence_score;
      r._area_matched_by = res.matched_by;
      (r as any).suggestions = res.suggestions;
      (r as any).ai_reasoning = res.ai_reasoning;
    }
  });

  // ── Stage 2: Cluster detection (best-effort, non-blocking) ───────────────
  let clusterInfo: PipelineResult["clusterInfo"] = null;
  try {
    const clusterRes = await fetch("/api/geo/cluster-detect", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inputs: parsed.map(r => r.area).filter(Boolean) }),
    });
    if (clusterRes.ok) {
      clusterInfo = await clusterRes.json();
      sessionStorage.setItem("import_cluster", JSON.stringify(clusterInfo));
    }
  } catch { /* best-effort */ }

  // ── Stage 3: Plan price auto-fill ─────────────────────────────────────────
  onStage?.("prices");
  let planPrices: Record<string, number> = {};
  if (gym) {
    const { data: priceRow } = await supabase
      .from("gym_plan_prices")
      .select("monthly, quarterly, annual")
      .eq("gym_id", gym.id)
      .single();
    if (priceRow) {
      planPrices = {
        monthly:   priceRow.monthly   ?? 0,
        quarterly: priceRow.quarterly ?? 0,
        annual:    priceRow.annual    ?? 0,
      };
    }
  }
  parsed.forEach(r => {
    const rawAmt = parseInt(r.amount);
    if (!r.amount || isNaN(rawAmt) || rawAmt === 0) {
      r.amount = String(planPrices[r.plan] ?? 0);
    }
  });

  // ── Stage 4 & 5 & 6: ID assignment + phone dedup ─────────────────────────
  onStage?.("ids");

  // Collect explicit numbers the file contains (GF-prefixed IDs that were
  // already parsed to integers by normalizeMemberNumber)
  const requestedNums = parsed
    .map((r) => parseInt(r.member_number))
    .filter((n) => !isNaN(n) && n > 0)

  // Ask the server for (a) the current MAX member_number and (b) which of the
  // requested numbers already exist. We do this via API because the client-side
  // Supabase instance is anon-keyed and RLS blocks direct member reads.
  let nextId = 1
  let conflictingNums = new Set<number>()
  let existingPhones: string[] = []

  if (gym) {
    const [idRes] = await Promise.all([
      // Single server call returns: next_id, conflicts, existing_phones
      fetch(
        `/api/import/next-member-id?${new URLSearchParams({
          ...(requestedNums.length > 0 && { requested: requestedNums.join(',') }),
        })}`,
      ).then(r => r.ok
        ? r.json() as Promise<{ next_id: number; conflicts: number[] }>
        : null
      ),
    ])

    if (idRes) {
      nextId           = idRes.next_id
      conflictingNums  = new Set(idRes.conflicts)
    }
  }

  // Phone dedup within file and DB phone conflict checks have been removed 
  // to allow duplicate phone numbers (e.g. families sharing a phone).

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
      // No explicit ID (legacy prefix or blank) — auto-assign
      const newNum = nextAvailable()
      r.member_number = String(newNum)
      r._id_auto = true
    } else {
      const inDB   = conflictingNums.has(parsedNum)
      const inFile = usedInFile.has(parsedNum)

      if (inDB || inFile) {
        // Preserve original as legacy reference, assign a fresh ID
        if (!r.legacy_member_id) {
          r.legacy_member_id = `GF${parsedNum.toString().padStart(4, '0')}`
        }
        const newNum = nextAvailable()
        r._error = `ID GF${parsedNum.toString().padStart(4, '0')} ${inDB ? 'exists in DB' : 'duplicate in file'} — auto-assigned GF${newNum.toString().padStart(4, '0')}`
        r.member_number = String(newNum)
        r._id_auto = true
        r._id_conflict = false
      } else {
        // Valid explicit ID — claim it and advance nextId past it
        usedInFile.add(parsedNum)
        if (parsedNum >= nextId) nextId = parsedNum + 1
      }
    }

    // Always record the final assigned number to catch intra-file duplicates
    const finalNum = parseInt(r.member_number)
    if (!isNaN(finalNum)) usedInFile.add(finalNum)
  })



  return { rows: parsed, clusterInfo };
}
