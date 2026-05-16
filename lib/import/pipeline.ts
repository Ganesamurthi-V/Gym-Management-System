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

  // Fetch existing DB state
  const [existingMembersRes, existingNumsRes] = gym
    ? await Promise.all([
        supabase.from("members").select("phone").eq("gym_id", gym.id) as unknown as Promise<{ data: { phone: string }[] | null }>,
        supabase.from("members").select("member_number").eq("gym_id", gym.id) as unknown as Promise<{ data: { member_number: number }[] | null }>,
      ])
    : [{ data: null }, { data: null }];

  const dbPhones = new Set((existingMembersRes.data ?? []).map(m => m.phone));
  const dbNums   = new Set((existingNumsRes.data ?? []).map(m => m.member_number));

  // Phone dedup within file
  const phoneCount = new Map<string, number>();
  parsed.forEach(r => {
    if (r.phone) phoneCount.set(r.phone, (phoneCount.get(r.phone) ?? 0) + 1);
  });
  parsed.forEach(r => {
    if (r._status !== "error" && r.phone && phoneCount.get(r.phone)! > 1) {
      r._status = "duplicate";
      r._error = "Duplicate phone in file";
    }
  });

  // ID assignment
  const assignedNums = new Set<string>();
  function nextAvailable(): string {
    let n = 1;
    while (dbNums.has(n) || assignedNums.has(String(n))) n++;
    return String(n);
  }

  const seenNums = new Set<string>();
  parsed.forEach(r => {
    if (r._status === "error" || r._status === "duplicate") return;
    if (!r.member_number) {
      const newNum = nextAvailable();
      assignedNums.add(newNum);
      seenNums.add(newNum);
      r.member_number = newNum;
      r._id_auto = true;
    } else {
      const inDB   = dbNums.has(parseInt(r.member_number));
      const inFile = seenNums.has(r.member_number);
      if (inDB || inFile) {
        const newNum = nextAvailable();
        assignedNums.add(newNum);
        seenNums.add(newNum);
        r._id_conflict = true;
        // Preserve the original ID as legacy before overwriting
        if (!r.legacy_member_id && r.member_number) {
          r.legacy_member_id = `GF${r.member_number.padStart(4, '0')}`;
        }
        r._error = `ID GF${r.member_number.padStart(4, '0')} ${inDB ? "exists in DB" : "duplicate in file"} — auto-assigned GF${newNum.padStart(4, '0')}`;
        r.member_number = newNum;
        r._id_auto = true;
      } else {
        seenNums.add(r.member_number);
        assignedNums.add(r.member_number);
      }
    }
  });

  // DB phone conflict check
  parsed.forEach(r => {
    if (r._status !== "error" && r._status !== "duplicate" && r.phone && dbPhones.has(r.phone)) {
      r._status = "duplicate";
      r._error = "Phone already exists in database";
    }
  });

  return { rows: parsed, clusterInfo };
}
