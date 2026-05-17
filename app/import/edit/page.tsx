"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, AlertTriangle, Search, Loader2, MapPin, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calcEndDate } from "@/lib/utils";
import { searchLocalities } from "@/lib/geo/matchArea";
import type { ImportedRow } from "../page";
import { useLenisScroll } from "@/lib/hooks/useLenisScroll";

type Step = "edit" | "preview" | "done";
interface DoneResult { success: number; skipped: number }

const EDIT_FIELDS: (keyof ImportedRow)[] = [
  "member_number", "name", "phone", "plan", "start_date",
  "amount", "payment_mode", "gender", "age", "area",
];

export default function ImportEditPage() {
  const router = useRouter();
  const supabase = createClient();

  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [originalRows, setOriginalRows] = useState<ImportedRow[]>([]);
  const [dbNums, setDbNums] = useState<Set<number>>(new Set());
  const [hasIdCol, setHasIdCol] = useState(false);
  const [step, setStep] = useState<Step>("edit");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [doneResult, setDoneResult] = useState<DoneResult>({ success: 0, skipped: 0 });
  const [activeAreaIdx, setActiveAreaIdx] = useState<number | null>(null);
  const [areaSuggestions, setAreaSuggestions] = useState<Record<number, Array<{ id: string; name: string; district: string }>>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const blurTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});
  const searchTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  const scrollRef = useRef<HTMLDivElement>(null);
  const mirrorRef = useRef<HTMLDivElement>(null);
  const tableInnerRef = useRef<HTMLDivElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  // Use Lenis smooth scroll on the final preview box container
  useLenisScroll(previewScrollRef, [rows, step]);

  // Track sidebar collapsed state for the fixed scrollbar left offset
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem('gymflow_sidebar_collapsed') === 'true');
    // Listen for storage changes (sidebar toggle)
    const onStorage = () => setSidebarCollapsed(localStorage.getItem('gymflow_sidebar_collapsed') === 'true');
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // Wheel isolation for all data-scroll-box elements
  // Uses non-passive listener ONLY on the specific scroll boxes, not document-wide
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const box = (e.target as HTMLElement).closest('[data-scroll-box]') as HTMLElement | null;
      if (!box) return;
      const { scrollTop, scrollHeight, clientHeight } = box;
      // Only prevent default when the box can actually scroll further
      const canScrollDown = e.deltaY > 0 && scrollTop + clientHeight < scrollHeight - 1;
      const canScrollUp   = e.deltaY < 0 && scrollTop > 0;
      if (canScrollDown || canScrollUp) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("import_rows");
    if (!stored) { router.push("/import"); return; }
    const parsed: ImportedRow[] = JSON.parse(stored);
    setRows(parsed);
    const origStored = sessionStorage.getItem("import_rows_original");
    setOriginalRows(origStored ? JSON.parse(origStored) : parsed.map(r => ({ ...r })));
    setHasIdCol(sessionStorage.getItem("import_has_id_col") === "1");
    // Load DB nums for live uniqueness validation
    async function loadDbNums() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: gym } = await supabase.from("gyms").select("id").eq("owner_id", user.id).single();
      if (!gym) return;
      const { data } = await supabase.from("members").select("member_number").eq("gym_id", gym.id) as { data: { member_number: number }[] | null };
      setDbNums(new Set((data ?? []).map(m => m.member_number)));
    }
    loadDbNums();
  }, []);

  // Sync mirror scrollbar width to table inner width
  useEffect(() => {
    if (tableInnerRef.current && mirrorRef.current) {
      mirrorRef.current.firstElementChild && ((mirrorRef.current.firstElementChild as HTMLElement).style.width = tableInnerRef.current.scrollWidth + 'px');
    }
  }, [rows]);

  // Keep mirror and table scroll in sync
  useEffect(() => {
    const table = scrollRef.current;
    const mirror = mirrorRef.current;
    if (!table || !mirror) return;
    let fromTable = false, fromMirror = false;
    const onTable = () => { if (fromMirror) { fromMirror = false; return; } fromTable = true; mirror.scrollLeft = table.scrollLeft; };
    const onMirror = () => { if (fromTable) { fromTable = false; return; } fromMirror = true; table.scrollLeft = mirror.scrollLeft; };
    table.addEventListener('scroll', onTable);
    mirror.addEventListener('scroll', onMirror);

    // Block wheel on the mirror bar — only drag should move it, not wheel
    const blockWheel = (e: WheelEvent) => e.preventDefault();
    mirror.addEventListener('wheel', blockWheel, { passive: false });

    return () => {
      table.removeEventListener('scroll', onTable);
      mirror.removeEventListener('scroll', onMirror);
      mirror.removeEventListener('wheel', blockWheel);
    };
  }, [rows]);
  // NOTE: No horizontal wheel-to-scroll on the table — that caused lag.
  // The table scrolls horizontally via the mirror scrollbar (drag only).

  function deleteSelected() {
    setRows(prev => {
      const remaining = prev.filter((_, i) => !selected.has(i));
      if (hasIdCol) return remaining; // file had IDs — don't touch them
      const usedNums = new Set(
        remaining.filter(r => !r._id_auto).map(r => parseInt(r.member_number)).filter(Boolean)
      );
      const dbAndUsed = new Set([...Array.from(dbNums), ...Array.from(usedNums)]);
      let next = 1;
      function nextAvail() {
        while (dbAndUsed.has(next)) next++;
        const n = next++;
        dbAndUsed.add(n);
        return String(n);
      }
      return remaining.map(r =>
        r._id_auto ? { ...r, member_number: nextAvail() } : r
      );
    });
    setOriginalRows(prev => prev.filter((_, i) => !selected.has(i)));
    setSelected(new Set());
  }

  function toggleSelect(idx: number) {
    setSelected(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });
  }

  function toggleSelectAll() {
    const visibleIdxs = filtered.map(r => r._idx);
    const allSelected = visibleIdxs.every(i => selected.has(i));
    setSelected(prev => {
      const s = new Set(prev);
      allSelected ? visibleIdxs.forEach(i => s.delete(i)) : visibleIdxs.forEach(i => s.add(i));
      return s;
    });
  }

  function updateRow(idx: number, field: keyof ImportedRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function validateId(idx: number, value: string) {
    const num = parseInt(value);
    if (!value || isNaN(num)) {
      setRows(prev => prev.map((r, i) => i === idx ? { ...r, _id_conflict: false, _id_missing: true } : r));
      return;
    }
    const inDB = dbNums.has(num);
    const inFile = rows.some((r, i) => i !== idx && r._status !== "error" && r._status !== "duplicate" && parseInt(r.member_number) === num);
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _id_conflict: inDB || inFile, _id_missing: false } : r));
  }

  const handleAreaSearch = useCallback((idx: number, query: string) => {
    clearTimeout(searchTimers.current[idx]);
    if (query.length < 2) { setAreaSuggestions(prev => ({ ...prev, [idx]: [] })); return; }
    searchTimers.current[idx] = setTimeout(async () => {
      const results = await searchLocalities(query);
      setAreaSuggestions(prev => ({ ...prev, [idx]: results }));
    }, 200);
  }, []);

  function isRowChanged(row: ImportedRow): boolean {
    const orig = originalRows.find(r => r._rowId === row._rowId);
    if (!orig) return false;
    return EDIT_FIELDS.some(f => row[f] !== orig[f]);
  }

  function isCellChanged(row: ImportedRow, field: keyof ImportedRow): boolean {
    const orig = originalRows.find(r => r._rowId === row._rowId);
    if (!orig) return false;
    return row[field] !== orig[field];
  }

  const validRows = rows.filter(r => r._status !== "error" && r._status !== "duplicate");
  const skippedRows = rows.filter(r => r._status === "error" || r._status === "duplicate");
  const editedCount = rows.reduce((count, row) => count + (isRowChanged(row) ? 1 : 0), 0);

  const filtered = rows.map((r, i) => ({ ...r, _idx: i })).filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.phone.includes(search) ||
    r.member_number.includes(search)
  );

  const hi = (row: ImportedRow, field: keyof ImportedRow) =>
    isCellChanged(row, field)
      ? "bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded"
      : "";

  const conflictCount = rows.filter(r => r._id_conflict).length;
  const missingIdCount = validRows.filter(r => !r.member_number || !parseInt(r.member_number)).length;

  const hasReviewState = typeof window !== "undefined" && !!sessionStorage.getItem("import_review_state");

  function goBackToReview() {
    // Persist current edits so they survive the round-trip
    sessionStorage.setItem("import_rows", JSON.stringify(rows));
    router.push("/import/review");
  }

  function handlePreview() {
    if (missingIdCount > 0) { setError(`${missingIdCount} member${missingIdCount !== 1 ? 's are' : ' is'} missing a Member ID — fill them in before importing`); return; }
    // Clear review state cache — user is committing to import
    sessionStorage.removeItem("import_review_state");
    setError("");
    setConfirmed(false);
    setStep("preview");
  }

  async function handleSave() {
    if (!confirmed) return;
    setLoading(true);
    setError("");

    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");
      const { data: gym } = await supabase.from("gyms").select("id").eq("owner_id", user.id).single();
      if (!gym) throw new Error("Gym not found");

      const { data: existingNums } = await supabase
        .from("members").select("member_number").eq("gym_id", gym.id) as { data: { member_number: number }[] | null };
      const existingNumSet = new Set((existingNums ?? []).map(m => m.member_number));
      const { data: maxData } = await supabase
        .from("members").select("member_number").eq("gym_id", gym.id)
        .order("member_number", { ascending: false }).limit(1) as { data: { member_number: number }[] | null };
      let nextAvailable = (maxData?.[0]?.member_number ?? 0) + 1;

      const toInsert = validRows;
      const skipped = skippedRows.length;

      // Final guard — re-check uniqueness at save time
      for (const row of toInsert) {
        const num = parseInt(row.member_number);
        if (!num) throw new Error(`Member "${row.name}" is missing a Member ID`);
        if (existingNumSet.has(num)) throw new Error(`Member ID #${num} is already taken ("${row.name}")`);
        existingNumSet.add(num);
      }

      const { data: insertedMembers, error: batchErr } = await supabase
        .from("members")
        .insert(toInsert.map(row => {
          let num = parseInt(row.member_number);
          if (!num || existingNumSet.has(num)) { num = nextAvailable; nextAvailable++; }
          existingNumSet.add(num);
          if (num >= nextAvailable) nextAvailable = num + 1;
          return {
            gym_id: gym.id,
            member_number: num,
            name: row.name,
            phone: row.phone,
            ...(row.gender && { gender: row.gender }),
            ...(row.age && { age: parseInt(row.age) }),
            ...(row.area && { area: row.area }),
            legacy_member_id: row.legacy_member_id || null,
          };
        }))
        .select("id, phone") as { data: { id: string; phone: string }[] | null; error: any };

      if (batchErr || !insertedMembers) throw new Error(batchErr?.message || "Insert failed");

      const phoneToId = new Map(insertedMembers.map(m => [m.phone, m.id]));
      const membershipsToInsert = toInsert.map(row => {
        const memberId = phoneToId.get(row.phone);
        if (!memberId) return null;
        const end_date = calcEndDate(row.start_date, row.plan as any);
        return {
          member_id: memberId, gym_id: gym.id, plan: row.plan,
          start_date: row.start_date, end_date,
          amount: parseInt(row.amount) || 0, payment_mode: row.payment_mode,
        };
      }).filter(Boolean) as any[];

      const { error: msErr } = await supabase.from("memberships").insert(membershipsToInsert);
      if (msErr) throw new Error(msErr.message);

      sessionStorage.removeItem("import_rows");
      sessionStorage.removeItem("import_rows_original");
      setDoneResult({ success: toInsert.length, skipped });
      setStep("done");
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setLoading(false);
    }
  }

  if (step === "done") {
    return (
      <div className="max-w-xl mx-auto">
        <div className="card p-10 text-center animate-pop-in">
          <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-emerald-100">
            <Check className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">Import Complete! 🎉</h2>
          <p className="text-slate-500 mt-2">
            <span className="text-emerald-600 font-bold text-lg">{doneResult.success}</span>
            <span className="text-slate-400"> members imported successfully</span>
            {doneResult.skipped > 0 && (
              <><br /><span className="text-red-400 text-sm">{doneResult.skipped} skipped</span></>
            )}
          </p>
          <div className="mt-4 mx-auto w-48 h-1.5 bg-emerald-100 rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 rounded-full animate-fill-bar" />
          </div>
          <div className="mt-6">
            <Link href="/members" className="btn-primary">View Members →</Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="max-w-7xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("edit")} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Review Before Importing</h1>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{validRows.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">Will be imported</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{editedCount}</p>
            <p className="text-sm text-slate-500 mt-0.5">Edited by you</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{skippedRows.length}</p>
            <p className="text-sm text-slate-500 mt-0.5">Will be skipped</p>
          </div>
        </div>

        <div className="card">
          <p className="px-5 py-3.5 text-sm font-bold text-slate-700 border-b border-slate-100 rounded-t-2xl">
            Members to be imported ({validRows.length})
          </p>
          {/* data-lenis-prevent tells root Lenis to hand off wheel events to this container */}
          <div
            ref={previewScrollRef}
            data-lenis-prevent
            className="overflow-y-auto overflow-x-auto no-scrollbar"
            style={{ maxHeight: '60vh', WebkitOverflowScrolling: 'touch' }}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 border-b border-slate-100">
                  {["#", "Name", "Phone", "Plan", "Start Date", "Amount", "Mode", "Gender", "Age", "Area"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-slate-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {validRows.map((row) => {
                  const anyChanged = isRowChanged(row);
                  return (
                    <tr key={row._rowId} className={anyChanged ? "bg-emerald-50/40" : "hover:bg-slate-50"}>
                      <td className="px-4 py-2.5 font-mono text-xs"><span className={hi(row, "member_number")}>{row.member_number ? `GF${row.member_number.padStart(4, '0')}` : "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "name")}>{row.name}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "phone")}>{row.phone}</span></td>
                      <td className="px-4 py-2.5 capitalize"><span className={hi(row, "plan")}>{row.plan}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "start_date")}>{row.start_date}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "amount")}>₹{row.amount}</span></td>
                      <td className="px-4 py-2.5 uppercase"><span className={hi(row, "payment_mode")}>{row.payment_mode}</span></td>
                      <td className="px-4 py-2.5 capitalize"><span className={hi(row, "gender")}>{row.gender || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "age")}>{row.age || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(row, "area")}>{row.area || "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
            <span className="text-xs text-slate-400">Green highlight = value edited by you</span>
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-blue-800">Please review carefully before importing</p>
            <p className="text-xs text-blue-700 mt-1">Once you confirm and click Import, the data will be saved to the server.</p>
          </div>
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)}
            className="w-4 h-4 rounded accent-brand-600" />
          <span className="text-sm text-slate-700 font-medium">
            I have reviewed all {validRows.length} members and confirm the data is correct
          </span>
        </label>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep("edit")}
            className="flex items-center justify-center gap-2 py-3 bg-slate-100 text-slate-700 font-semibold text-sm rounded-2xl hover:bg-slate-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <button onClick={handleSave} disabled={!confirmed || loading}
            className="relative flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm rounded-2xl shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-40 overflow-hidden group"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Importing {validRows.length} members...</span>
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Import {validRows.length} Members</span>
                <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  const cls = "px-2 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white disabled:bg-slate-50 disabled:text-slate-400";

  return (
    <div className="space-y-4 pb-6 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          {hasReviewState ? (
            <button onClick={goBackToReview} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />Review Areas
            </button>
          ) : (
            <Link href="/import" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />Import
            </Link>
          )}
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Edit Before Importing</h1>
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <button onClick={deleteSelected}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-50 text-red-600 text-sm font-semibold rounded-lg border border-red-200 hover:bg-red-100 transition-all"
            >
              <Trash2 className="w-4 h-4" />
              Delete {selected.size}
            </button>
          )}
          {editedCount > 0 && (
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
              {editedCount} edited
            </span>
          )}
          <button onClick={handlePreview} disabled={conflictCount > 0 || missingIdCount > 0}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-40"
          >
            <Check className="w-4 h-4" />Review & Import
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-slate-500">
        <span className="text-emerald-600 font-semibold">{validRows.length} valid</span>
        <span>·</span>
        <span className="text-red-500 font-semibold">{skippedRows.length} will be skipped</span>
      </div>

      {(conflictCount > 0 || missingIdCount > 0 || error) && (
        <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
          <p className="text-sm font-semibold text-red-700">
            {missingIdCount > 0 && `${missingIdCount} member${missingIdCount !== 1 ? 's are' : ' is'} missing a Member ID`}
            {missingIdCount > 0 && conflictCount > 0 && " · "}
            {conflictCount > 0 && `${conflictCount} Member ID${conflictCount !== 1 ? 's are' : ' is'} already taken`}
            {(missingIdCount > 0 || conflictCount > 0) ? " — fix before importing" : error}
          </p>
        </div>
      )}

      {/* Areas needing review banner */}
      {(() => {
        const needsReview = rows.filter(r => r.area && (r._area_confidence ?? 1) < 0.90);
        if (needsReview.length === 0) return null;
        return (
          <div className="flex items-center gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
            <MapPin className="w-4 h-4 text-amber-500 flex-shrink-0" />
            <p className="text-sm font-semibold text-amber-800">
              {needsReview.length} area{needsReview.length !== 1 ? 's' : ''} need review — check the dots in the Area column
            </p>
            <div className="flex items-center gap-2 ml-auto text-xs text-amber-700">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />Suggested</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400 inline-block" />Unresolved</span>
            </div>
          </div>
        );
      })()}

      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input type="search" placeholder="Search..." value={search}
          onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
      </div>

      {/* Fixed mirror scrollbar — follows user as they scroll down, always at bottom of viewport */}
      <div
        ref={mirrorRef}
        className="fixed bottom-0 z-30 overflow-x-auto overflow-y-hidden h-3 bg-white/90 backdrop-blur-sm border-t border-slate-200"
        style={{
          left: sidebarCollapsed ? '3.5rem' : '15rem',
          right: 0,
        }}
      >
        <div style={{ height: 1 }} />
      </div>

      <div className="card overflow-hidden">
        <div ref={scrollRef} className="overflow-x-auto">
          <div ref={tableInnerRef} className="pr-6 min-w-max">
          <table className="text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50">
                <th className="px-3 py-3 w-8">
                  <input type="checkbox"
                    checked={filtered.length > 0 && filtered.every(r => selected.has(r._idx))}
                    onChange={toggleSelectAll}
                    className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer"
                  />
                </th>
                <th className="px-3 py-3 w-8"></th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide w-20">ID</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Plan</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Start Date</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Amount</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Mode</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Gender</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide w-16">Age</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide" style={{ minWidth: '180px', maxWidth: '220px', width: '200px' }}>Area ✦</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(row => {
                const idx = row._idx;
                const isSkipped = row._status === "error" || row._status === "duplicate";
                const changed = isRowChanged(row);
                const suggestions = areaSuggestions[idx] ?? [];

                return (
                  <tr key={idx} className={isSkipped ? "bg-red-50 opacity-60" : selected.has(idx) ? "bg-red-50/60" : changed ? "bg-brand-50/20" : "hover:bg-slate-50"}>
                    <td className="px-3 py-2">
                      <input type="checkbox"
                        checked={selected.has(idx)}
                        onChange={() => toggleSelect(idx)}
                        className="w-3.5 h-3.5 rounded accent-red-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-3 py-2">
                      {isSkipped ? <AlertTriangle className="w-4 h-4 text-red-400" />
                        : (row._id_conflict || row._id_missing) ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                        : <Check className="w-4 h-4 text-emerald-500" />}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-col gap-0.5">
                        <input
                          type="text"
                          value={row.member_number ? `GF${row.member_number.padStart(4, '0')}` : ''}
                          disabled={isSkipped}
                          onChange={e => {
                            // Accept "GF0001" or plain "1" — strip prefix and store integer string
                            const raw = e.target.value.trim().toUpperCase();
                            const digits = raw.startsWith('GF') ? raw.slice(2) : raw;
                            const num = parseInt(digits, 10);
                            updateRow(idx, "member_number", isNaN(num) ? '' : String(num));
                          }}
                          onBlur={e => {
                            const raw = e.target.value.trim().toUpperCase();
                            const digits = raw.startsWith('GF') ? raw.slice(2) : raw;
                            validateId(idx, digits);
                          }}
                          placeholder="GF0001"
                          className={`w-20 ${cls} ${
                            (row._id_conflict || row._id_missing) ? 'border-red-400 bg-red-50 text-red-700' : ''
                          }`}
                        />
                        {row._id_auto && !row._id_conflict && (
                          <span className="text-[9px] text-amber-500 font-semibold leading-none" title="No ID in file — auto-assigned. You can change it.">auto</span>
                        )}
                        {row._id_conflict && (
                          <span className="text-[9px] text-red-500 font-semibold leading-none">taken!</span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={row.name} disabled={isSkipped}
                        onChange={e => updateRow(idx, "name", e.target.value)}
                        className={`w-36 ${cls}`} />
                      {row._error && <p className="text-[10px] text-amber-600 mt-0.5">{row._error}</p>}
                      {!isSkipped && row.phone && row.phone.length !== 10 && (
                        <p className="text-[9px] text-amber-600 font-semibold mt-0.5 leading-tight">⚠ WhatsApp won't work</p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <input type="tel" value={row.phone} disabled={isSkipped} maxLength={10}
                        onChange={e => updateRow(idx, "phone", e.target.value)}
                        className={`w-28 ${cls}`} />
                    </td>
                    <td className="px-3 py-2">
                      <select value={row.plan} disabled={isSkipped}
                        onChange={e => updateRow(idx, "plan", e.target.value)}
                        className={cls}>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="annual">Annual</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="date" value={row.start_date} disabled={isSkipped}
                        onChange={e => updateRow(idx, "start_date", e.target.value)}
                        className={`w-36 ${cls}`} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={row.amount} disabled={isSkipped}
                        onChange={e => updateRow(idx, "amount", e.target.value)}
                        className={`w-20 ${cls}`} />
                    </td>
                    <td className="px-3 py-2">
                      <select value={row.payment_mode} disabled={isSkipped}
                        onChange={e => updateRow(idx, "payment_mode", e.target.value)}
                        className={cls}>
                        <option value="cash">Cash</option>
                        <option value="upi">UPI</option>
                        <option value="card">Card</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <select value={row.gender} disabled={isSkipped}
                        onChange={e => updateRow(idx, "gender", e.target.value)}
                        className={cls}>
                        <option value="">—</option>
                        <option value="male">Male</option>
                        <option value="female">Female</option>
                        <option value="other">Other</option>
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" value={row.age} disabled={isSkipped} min="1" max="120"
                        onChange={e => updateRow(idx, "age", e.target.value)}
                        className={`w-14 ${cls}`} placeholder="—" />
                    </td>
                    <td className="px-3 py-2 relative" style={{ minWidth: '180px', maxWidth: '220px', width: '200px' }}>
                      <div className="flex items-center gap-1.5 w-full overflow-hidden">
                        {row.area && !isSkipped && (
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                            (row._area_confidence ?? 1) >= 0.90 ? 'bg-emerald-500' :
                            (row._area_confidence ?? 1) >= 0.70 ? 'bg-amber-400' : 'bg-red-400'
                          }`} title={`${((row._area_confidence ?? 1) * 100).toFixed(0)}% confidence (${row._area_matched_by ?? 'unknown'})`} />
                        )}
                        <input type="text" value={row.area} disabled={isSkipped}
                          onChange={e => {
                            updateRow(idx, "area", e.target.value);
                            setActiveAreaIdx(idx);
                            handleAreaSearch(idx, e.target.value);
                          }}
                          onFocus={() => { clearTimeout(blurTimers.current[idx]); setActiveAreaIdx(idx); }}
                          onBlur={() => { blurTimers.current[idx] = setTimeout(() => setActiveAreaIdx(null), 150); }}
                          className={`flex-1 min-w-0 ${cls}`} placeholder="Area" autoComplete="off" />
                      </div>
                      {activeAreaIdx === idx && suggestions.length > 0 && (
                        <ul className="absolute z-30 left-3 right-3 bg-white border border-slate-200 rounded-xl shadow-xl max-h-36 overflow-y-auto mt-0.5" data-scroll-box>
                          {suggestions.slice(0, 5).map(a => (
                            <li key={a.id}
                              onMouseDown={() => {
                                updateRow(idx, "area", a.name);
                                updateRow(idx, "_area_confidence" as any, "1");
                                setActiveAreaIdx(null);
                              }}
                              className="px-3 py-1.5 text-xs text-slate-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                            >
                              <span className="font-medium">{a.name}</span>
                              {a.district && <span className="text-slate-400 ml-1">{a.district}</span>}
                            </li>
                          ))}
                        </ul>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
        </div>
      </div>
    </div>
  );
}
