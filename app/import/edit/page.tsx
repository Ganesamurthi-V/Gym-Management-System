"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Check, AlertTriangle, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calcEndDate } from "@/lib/utils";
import { AREAS } from "@/lib/areas";
import type { ImportedRow } from "../page";

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
  const [step, setStep] = useState<Step>("edit");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [doneResult, setDoneResult] = useState<DoneResult>({ success: 0, skipped: 0 });
  const [activeAreaIdx, setActiveAreaIdx] = useState<number | null>(null);
  const blurTimers = useRef<Record<number, ReturnType<typeof setTimeout>>>({});

  useEffect(() => {
    const stored = sessionStorage.getItem("import_rows");
    if (!stored) { router.push("/import"); return; }
    const parsed = JSON.parse(stored);
    setRows(parsed);
    const origStored = sessionStorage.getItem("import_rows_original");
    setOriginalRows(origStored ? JSON.parse(origStored) : JSON.parse(stored));
  }, []);

  function updateRow(idx: number, field: keyof ImportedRow, value: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, [field]: value } : r));
  }

  function isRowChanged(rowIdx: number): boolean {
    const row = rows[rowIdx];
    const orig = originalRows[rowIdx];
    if (!orig) return false;
    return EDIT_FIELDS.some(f => row[f] !== orig[f]);
  }

  function isCellChanged(rowIdx: number, field: keyof ImportedRow): boolean {
    const orig = originalRows[rowIdx];
    if (!orig) return false;
    return rows[rowIdx]?.[field] !== orig[field];
  }

  const validRows = rows.filter(r => r._status !== "error" && r._status !== "duplicate");
  const skippedRows = rows.filter(r => r._status === "error" || r._status === "duplicate");
  const editedCount = rows.reduce((count, _, i) => count + (isRowChanged(i) ? 1 : 0), 0);

  const filtered = rows.map((r, i) => ({ ...r, _idx: i })).filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase()) ||
    r.phone.includes(search) ||
    r.member_number.includes(search)
  );

  const hi = (rowIdx: number, field: keyof ImportedRow) =>
    isCellChanged(rowIdx, field)
      ? "bg-emerald-100 text-emerald-800 font-semibold px-1.5 py-0.5 rounded"
      : "";

  function handlePreview() {
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

      const { data: insertedMembers, error: batchErr } = await supabase
        .from("members")
        .insert(toInsert.map(row => {
          let num = row.member_number ? parseInt(row.member_number) : 0;
          if (!num || existingNumSet.has(num)) num = nextAvailable;
          existingNumSet.add(num);
          if (num >= nextAvailable) nextAvailable = num + 1;
          return {
            gym_id: gym.id,
            member_number: num,
            name: row.name,
            phone: row.phone,
            ...(row.gender && { gender: row.gender }),
            ...(row.age && { age: parseInt(row.age) }),
            ...(row.area   && { area: row.area }),
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
        <div className="card p-10 text-center">
          <div className="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-7 h-7 text-emerald-600" />
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Import Complete</h2>
          <p className="text-gray-500">
            <span className="text-emerald-600 font-bold">{doneResult.success} imported</span>
            {doneResult.skipped > 0 && <> · <span className="text-red-500 font-bold">{doneResult.skipped} skipped</span></>}
          </p>
          <div className="mt-6">
            <Link href="/members" className="btn-primary">View Members</Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="max-w-4xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <button onClick={() => setStep("edit")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Review Before Importing</h1>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-emerald-600">{validRows.length}</p>
            <p className="text-sm text-gray-500 mt-0.5">Will be imported</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-brand-600">{editedCount}</p>
            <p className="text-sm text-gray-500 mt-0.5">Edited by you</p>
          </div>
          <div className="card p-4 text-center">
            <p className="text-2xl font-bold text-red-500">{skippedRows.length}</p>
            <p className="text-sm text-gray-500 mt-0.5">Will be skipped</p>
          </div>
        </div>

        <div className="card overflow-hidden">
          <p className="px-5 py-3.5 text-sm font-bold text-gray-700 border-b border-gray-100">
            Members to be imported ({validRows.length})
          </p>
          <div className="overflow-x-auto max-h-64 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  {["#", "Name", "Phone", "Plan", "Start Date", "Amount", "Mode", "Gender", "Age", "Area"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {validRows.map((row) => {
                  const rowIdx = rows.indexOf(row);
                  const anyChanged = isRowChanged(rowIdx);
                  return (
                    <tr key={rowIdx} className={anyChanged ? "bg-emerald-50/40" : "hover:bg-gray-50"}>
                      <td className="px-4 py-2.5 font-mono text-xs"><span className={hi(rowIdx, "member_number")}>{row.member_number || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "name")}>{row.name}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "phone")}>{row.phone}</span></td>
                      <td className="px-4 py-2.5 capitalize"><span className={hi(rowIdx, "plan")}>{row.plan}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "start_date")}>{row.start_date}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "amount")}>₹{row.amount}</span></td>
                      <td className="px-4 py-2.5 uppercase"><span className={hi(rowIdx, "payment_mode")}>{row.payment_mode}</span></td>
                      <td className="px-4 py-2.5 capitalize"><span className={hi(rowIdx, "gender")}>{row.gender || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "age")}>{row.age || "—"}</span></td>
                      <td className="px-4 py-2.5"><span className={hi(rowIdx, "area")}>{row.area || "—"}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="inline-block w-3 h-3 rounded bg-emerald-100 border border-emerald-300"></span>
            <span className="text-xs text-gray-400">Green highlight = value edited by you</span>
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
          <span className="text-sm text-gray-700 font-medium">
            I have reviewed all {validRows.length} members and confirm the data is correct
          </span>
        </label>

        {error && <p className="text-sm text-red-600 font-medium">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <button onClick={() => setStep("edit")}
            className="flex items-center justify-center gap-2 py-3 bg-gray-100 text-gray-700 font-semibold text-sm rounded-2xl hover:bg-gray-200 transition-all"
          >
            <ArrowLeft className="w-4 h-4" />Back to Edit
          </button>
          <button onClick={handleSave} disabled={!confirmed || loading}
            className="flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold text-sm rounded-2xl shadow-md shadow-emerald-200 hover:from-emerald-600 hover:to-emerald-700 transition-all disabled:opacity-40"
          >
            <Check className="w-4 h-4" />
            {loading ? "Importing..." : `Import ${validRows.length} Members`}
          </button>
        </div>
      </div>
    );
  }

  // ── Edit ──────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/import" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
            <ArrowLeft className="w-4 h-4" />Import
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Edit Before Importing</h1>
        </div>
        <div className="flex items-center gap-2">
          {editedCount > 0 && (
            <span className="text-xs font-semibold text-brand-600 bg-brand-50 px-2.5 py-1 rounded-full border border-brand-200">
              {editedCount} edited
            </span>
          )}
          <button onClick={handlePreview}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-lg shadow-sm hover:from-brand-600 hover:to-brand-700 transition-all"
          >
            <Check className="w-4 h-4" />Review & Import
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 text-sm text-gray-500">
        <span className="text-emerald-600 font-semibold">{validRows.length} valid</span>
        <span>·</span>
        <span className="text-red-500 font-semibold">{skippedRows.length} will be skipped</span>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input type="search" placeholder="Search..." value={search}
          onChange={e => setSearch(e.target.value)} className="input-field pl-9" />
      </div>

      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="px-3 py-3 w-8"></th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide w-20">ID</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Name</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Phone</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Plan</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Start Date</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Amount</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Mode</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide">Gender</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide w-16">Age</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-gray-400 uppercase tracking-wide min-w-[150px]">Area</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(row => {
                const idx = row._idx;
                const isSkipped = row._status === "error" || row._status === "duplicate";
                const changed = isRowChanged(idx);
                const areaSuggestions = row.area.length > 0
                  ? AREAS.filter(a => a.toLowerCase().includes(row.area.toLowerCase()))
                  : [];
                const cls = "px-2 py-1 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-brand-400 bg-white disabled:bg-gray-50 disabled:text-gray-400";

                return (
                  <tr key={idx} className={isSkipped ? "bg-red-50 opacity-60" : changed ? "bg-brand-50/20" : "hover:bg-gray-50"}>
                    <td className="px-3 py-2">
                      {isSkipped ? <AlertTriangle className="w-4 h-4 text-red-400" />
                        : row._error ? <AlertTriangle className="w-4 h-4 text-amber-400" />
                        : <Check className="w-4 h-4 text-emerald-500" />}
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={row.member_number} disabled={isSkipped}
                        onChange={e => updateRow(idx, "member_number", e.target.value)}
                        className={`w-16 ${cls}`} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="text" value={row.name} disabled={isSkipped}
                        onChange={e => updateRow(idx, "name", e.target.value)}
                        className={`w-36 ${cls}`} />
                      {row._error && <p className="text-[10px] text-amber-600 mt-0.5">{row._error}</p>}
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
                    <td className="px-3 py-2 relative">
                      <input type="text" value={row.area} disabled={isSkipped}
                        onChange={e => { updateRow(idx, "area", e.target.value); setActiveAreaIdx(idx); }}
                        onFocus={() => { clearTimeout(blurTimers.current[idx]); setActiveAreaIdx(idx); }}
                        onBlur={() => { blurTimers.current[idx] = setTimeout(() => setActiveAreaIdx(null), 150); }}
                        className={`w-full ${cls}`} placeholder="Area" autoComplete="off" />
                      {activeAreaIdx === idx && areaSuggestions.length > 0 && (
                        <ul className="absolute z-30 left-3 right-3 bg-white border border-gray-200 rounded-xl shadow-xl max-h-36 overflow-y-auto mt-0.5">
                          {areaSuggestions.slice(0, 5).map(a => (
                            <li key={a}
                              onMouseDown={() => { updateRow(idx, "area", a); setActiveAreaIdx(null); }}
                              className="px-3 py-1.5 text-xs text-gray-700 hover:bg-brand-50 hover:text-brand-700 cursor-pointer"
                            >{a}</li>
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
  );
}
