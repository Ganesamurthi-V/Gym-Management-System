"use client";

import { useState, useEffect, useMemo, Fragment, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import WizardHeader from "@/components/import/WizardHeader";
import {
  ArrowLeft, Check, AlertTriangle, MapPin, Search,
  Cpu, Zap, RefreshCw, Save, ChevronDown, ChevronUp,
  Filter, CheckSquare, Square, BookOpen, X, CheckCircle,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { ImportedRow } from "../page";

interface ReviewRow extends ImportedRow {
  _idx: number;
  _original_area: string;
  _area_override?: string;
  _save_alias?: boolean;
  _review_done?: boolean;
  suggestions?: Array<{ name: string; confidence: number; matched_by?: string }>;
  ai_reasoning?: string;
}

type FilterMode = "pending" | "low" | "unresolved" | "done";

const confidenceColor = (c: number, method?: string) => {
  if (method === "unresolved" || c === 0) return "bg-red-500";
  if (c >= 0.90) return "bg-emerald-500";
  if (c >= 0.70) return "bg-amber-400";
  return "bg-orange-500";
};

const confidenceLabel = (c: number, method?: string) => {
  if (method === "unresolved" || c === 0) return { text: "Unresolved", cls: "bg-red-100 text-red-700 border-red-200" };
  if (c >= 0.90) return { text: `${(c * 100).toFixed(0)}% · Auto`, cls: "bg-emerald-100 text-emerald-700 border-emerald-200" };
  if (c >= 0.70) return { text: `${(c * 100).toFixed(0)}% · Review`, cls: "bg-amber-100 text-amber-700 border-amber-200" };
  return { text: `${(c * 100).toFixed(0)}% · Low`, cls: "bg-orange-100 text-orange-700 border-orange-200" };
};

const methodIcon = (m?: string) => {
  switch (m) {
    case "ai": return <span title="AI inferred"><Cpu className="w-3 h-3" /></span>;
    case "exact": return <span title="Exact match"><Check className="w-3 h-3" /></span>;
    case "alias": return <span title="Alias match"><BookOpen className="w-3 h-3" /></span>;
    case "fuzzy": case "phonetic": case "trigram": return <span title="Fuzzy match"><Zap className="w-3 h-3" /></span>;
    default: return <span title="Unresolved"><AlertTriangle className="w-3 h-3 text-red-400" /></span>;
  }
};

export default function ImportReviewPage() {
  const router = useRouter();
  const supabase = createClient();

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [gymId, setGymId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterMode>("pending");
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const [suggestions, setSuggestions] = useState<Record<number, Array<{ id: string; name: string; district: string }>>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [selectedIdxs, setSelectedIdxs] = useState<Set<number>>(new Set());
  const [showBulkBar, setShowBulkBar] = useState(false);
  const [clusterInfo, setClusterInfo] = useState<{ top_district: string; top_state: string; confidence: number } | null>(null);
  const [acceptingAll, setAcceptingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Wheel isolation: any element with data-scroll-box scrolls independently
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const box = (e.target as HTMLElement).closest('[data-scroll-box]') as HTMLElement | null;
      if (!box) return;
      const { scrollTop, scrollHeight, clientHeight } = box;
      const atTop    = scrollTop <= 0 && e.deltaY < 0;
      const atBottom = scrollTop + clientHeight >= scrollHeight - 1 && e.deltaY > 0;
      if (!atTop && !atBottom) e.preventDefault();
    };
    document.addEventListener('wheel', onWheel, { passive: false });
    return () => document.removeEventListener('wheel', onWheel);
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem("import_rows");
    if (!stored) { router.push("/owner/import"); return; }

    // Restore previously reviewed state if coming back from edit page
    const reviewState = sessionStorage.getItem("import_review_state");
    if (reviewState) {
      setRows(JSON.parse(reviewState));
    } else {
      const parsed: ImportedRow[] = JSON.parse(stored);
      setRows(
        parsed.map((r, i) => ({
          ...r,
          _idx: i,
          _original_area: r.area,
          _save_alias: false,
          _review_done: (r._area_confidence ?? 0) >= 0.90,
        }))
      );
    }

    const cluster = sessionStorage.getItem("import_cluster");
    if (cluster) setClusterInfo(JSON.parse(cluster));

    async function loadGym() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data: gym } = await supabase.from("gyms").select("id").eq("owner_id", user.id).single();
      if (gym) setGymId(gym.id);
    }
    loadGym();
  }, []);

  const filtered = useMemo(() => {
    return rows
      .filter(r => {
        if (filter === "pending") return !r._review_done;
        if (filter === "low") return (r._area_confidence ?? 0) < 0.90 && r._area_matched_by !== "unresolved";
        if (filter === "unresolved") return r._area_matched_by === "unresolved" || (r._area_confidence ?? 0) === 0;
        if (filter === "done") return r._review_done;
        return true;
      })
      .filter(r => {
        if (!search) return true;
        return (
          r.name?.toLowerCase().includes(search.toLowerCase()) ||
          r.area?.toLowerCase().includes(search.toLowerCase()) ||
          r._original_area?.toLowerCase().includes(search.toLowerCase())
        );
      });
  }, [rows, filter, search]);

  const stats = useMemo(() => ({
    total: rows.length,
    autoAccepted: rows.filter(r => (r._area_confidence ?? 0) >= 0.90).length,
    needsReview: rows.filter(r => (r._area_confidence ?? 0) < 0.90 && (r._area_confidence ?? 0) > 0).length,
    unresolved: rows.filter(r => r._area_matched_by === "unresolved" || (r._area_confidence ?? 0) === 0).length,
    done: rows.filter(r => r._review_done).length,
  }), [rows]);

  async function handleAreaSearch(_idx: number, _query: string) {
    // Area suggestions removed — plain text input only
  }

  function updateArea(idx: number, value: string) {
    const targetOriginal = rows.find(r => r._idx === idx)?._original_area;
    setRows(prev => prev.map((r) =>
      r._original_area === targetOriginal
        ? { ...r, area: value, _area_override: value, _review_done: false }
        : r
    ));
  }

  function acceptRow(idx: number) {
    const targetOriginal = rows.find(r => r._idx === idx)?._original_area;
    const targetVal = rows.find(r => r._idx === idx)?.area;
    setRows(prev => prev.map((r) =>
      r._original_area === targetOriginal
        ? { ...r, area: targetVal ?? r.area, _area_override: targetVal ?? r._area_override, _review_done: true, _area_confidence: Math.max(r._area_confidence ?? 0, 0.90) }
        : r
    ));
    setSuggestions(p => {
      const copy = { ...p };
      rows.forEach(r => {
        if (r._original_area === targetOriginal) {
          delete copy[r._idx];
        }
      });
      return copy;
    });
  }

  function selectSuggestion(idx: number, name: string) {
    const targetOriginal = rows.find(r => r._idx === idx)?._original_area;
    setRows(prev => prev.map((r) =>
      r._original_area === targetOriginal
        ? { ...r, area: name, _area_override: name, _area_confidence: 1.0, _area_matched_by: "manual", _review_done: true }
        : r
    ));
    setSuggestions(p => {
      const copy = { ...p };
      rows.forEach(r => {
        if (r._original_area === targetOriginal) {
          delete copy[r._idx];
        }
      });
      return copy;
    });
  }

  function toggleSaveAlias(idx: number) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, _save_alias: !r._save_alias } : r));
  }

  function applyBulkReplace() {
    if (!bulkValue.trim() || selectedIdxs.size === 0) return;
    setRows(prev => prev.map((r, i) =>
      selectedIdxs.has(i)
        ? { ...r, area: bulkValue.trim(), _area_override: bulkValue.trim(), _review_done: true, _area_confidence: 1.0, _area_matched_by: "manual" }
        : r
    ));
    setSelectedIdxs(new Set());
    setBulkValue("");
    setShowBulkBar(false);
  }

  function toggleSelect(idx: number) {
    setSelectedIdxs(prev => { const s = new Set(prev); s.has(idx) ? s.delete(idx) : s.add(idx); return s; });
  }

  function toggleSelectAll() {
    const allIdxs = filtered.map(r => r._idx);
    const allSelected = allIdxs.every(i => selectedIdxs.has(i));
    setSelectedIdxs(prev => {
      const s = new Set(prev);
      allSelected ? allIdxs.forEach(i => s.delete(i)) : allIdxs.forEach(i => s.add(i));
      return s;
    });
  }

  function handleDeleteSelected() {
    if (selectedIdxs.size === 0) return;
    if (!confirm(`Delete ${selectedIdxs.size} selected row${selectedIdxs.size !== 1 ? "s" : ""}?`)) return;
    
    setDeleting(true);
    const selectedSet = new Set(selectedIdxs);
    setRows(prev => prev.filter(r => !selectedSet.has(r._idx)));
    setSelectedIdxs(new Set());
    setDeleting(false);
  }

  async function handleAcceptAll() {
    setAcceptingAll(true);
    // Accept all unresolved/low confidence rows
    setRows(prev => prev.map(r => {
      if (r._review_done) return r;
      return {
        ...r,
        _review_done: true,
        _area_confidence: Math.max(r._area_confidence ?? 0, 0.90),
        _area_matched_by: r._area_matched_by === "unresolved" ? "manual" : r._area_matched_by,
      };
    }));
    setAcceptingAll(false);
  }

  // Persist current review state so back-navigation from edit restores it
  function persistReviewState() {
    sessionStorage.setItem("import_review_state", JSON.stringify(rows));
  }

  async function handleSaveAndProceed() {
    setSaving(true);
    setSaveMsg("");

    const aliasRows = rows.filter(r => r._save_alias && r._area_override && r._original_area);
    for (const r of aliasRows) {
      try {
        await fetch("/api/geo/save-alias", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_input: r._original_area, canonical_name: r._area_override ?? r.area, gym_id: gymId }),
        });
      } catch { /* best-effort */ }
    }

    // Strip review-only fields before writing back to sessionStorage
    const updated = rows.map(({ _idx, _original_area, _area_override, _save_alias, _review_done, ...rest }) => rest);
    sessionStorage.setItem("import_rows", JSON.stringify(updated));
    persistReviewState();

    setSaveMsg(`Saved ${aliasRows.length} alias${aliasRows.length !== 1 ? "es" : ""}. Proceeding…`);
    setTimeout(() => router.push("/owner/import/edit"), 800);
  }

  const unresolvedCount = rows.filter(r => r._area_matched_by === "unresolved" || (r._area_confidence ?? 0) === 0).length;

  function goBack() {
    persistReviewState();
    router.push("/owner/import");
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      <WizardHeader currentStep={4} />
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/owner/import" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />Import
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Review Areas</h1>
        <span className="text-xs text-slate-400">Step 4 of 6</span>
        {/* Save & Continue button duplicated at top for quick access */}
        <div className="ml-auto flex items-center gap-3">
          {saveMsg && (
            <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1">
              <Check className="w-4 h-4" />{saveMsg}
            </p>
          )}
          <button onClick={goBack} className="btn-secondary text-sm px-4 py-2 w-auto">← Back</button>
          <button onClick={handleSaveAndProceed} disabled={saving}
            className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-brand-500 to-brand-600 text-white text-sm font-semibold rounded-xl shadow-sm hover:from-brand-600 hover:to-brand-700 transition-all disabled:opacity-60"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>

      {/* Cluster intelligence banner */}
      {clusterInfo && clusterInfo.top_district && (
        <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
          <MapPin className="w-4 h-4 text-blue-500 flex-shrink-0" />
          <div>
            <span className="text-sm font-semibold text-blue-800">
              Dataset detected as <span className="capitalize">{clusterInfo.top_district}</span>, {clusterInfo.top_state}
            </span>
            <span className="text-xs text-blue-500 ml-2">
              ({(clusterInfo.confidence * 100).toFixed(0)}% confidence) — used to boost nearby matches
            </span>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">

        <button onClick={handleAcceptAll} disabled={acceptingAll || stats.done === stats.total}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-600 border border-emerald-200 rounded-xl hover:bg-emerald-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <CheckCircle className="w-3.5 h-3.5" />
          {acceptingAll ? "Accepting all…" : `Accept All (${stats.needsReview + stats.unresolved})`}
        </button>

        <button onClick={handleDeleteSelected} disabled={deleting || selectedIdxs.size === 0}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
          {deleting ? "Deleting…" : `Delete Selected (${selectedIdxs.size})`}
        </button>
      </div>

      {/* Review table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-100">
                <th className="px-3 py-3 w-8">
                  <button onClick={toggleSelectAll} className="text-slate-400 hover:text-slate-600">
                    {filtered.length > 0 && filtered.every(r => selectedIdxs.has(r._idx))
                      ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                </th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Member</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Raw Input</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide min-w-[180px]">Suggested Match</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Confidence</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Method</th>
                <th className="text-left px-3 py-3 text-xs font-bold text-slate-400 uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filtered.map(row => {
                const conf = row._area_confidence ?? 0;
                const method = row._area_matched_by;
                const label = confidenceLabel(conf, method);
                const isExpanded = expandedIdx === row._idx;
                const rowSuggestions = suggestions[row._idx] ?? [];
                const isSelected = selectedIdxs.has(row._idx);
                const isDone = row._review_done;

                return (
                  <Fragment key={row._idx}>
                    <tr
                      className={`transition-colors ${
                        isDone ? "bg-emerald-50/30" :
                        isSelected ? "bg-brand-50/50" :
                        method === "unresolved" || conf === 0 ? "bg-red-50/40" :
                        conf < 0.70 ? "bg-orange-50/30" :
                        conf < 0.90 ? "bg-amber-50/20" :
                        "hover:bg-slate-50"
                      }`}
                    >
                      <td className="px-3 py-3">
                        <button onClick={() => toggleSelect(row._idx)} className="text-slate-400 hover:text-brand-500">
                          {isSelected ? <CheckSquare className="w-4 h-4 text-brand-500" /> : <Square className="w-4 h-4" />}
                        </button>
                      </td>
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{row.name || "—"}</p>
                        <p className="text-xs text-slate-400">#{row.member_number}</p>
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs bg-slate-100 text-slate-600 px-2 py-1 rounded">
                          {row._original_area || "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3 relative">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2 h-2 rounded-full flex-shrink-0 ${confidenceColor(conf, method)}`} />
                          <input
                            type="text"
                            value={row.area ?? ""}
                            onChange={e => {
                              updateArea(row._idx, e.target.value);
                              handleAreaSearch(row._idx, e.target.value);
                              setExpandedIdx(row._idx);
                            }}
                            onFocus={() => setExpandedIdx(row._idx)}
                            onBlur={() => setTimeout(() => setExpandedIdx(null), 200)}
                            className="input-field text-xs w-full"
                            placeholder="Type to search…"
                          />
                        </div>
                        {isExpanded && rowSuggestions.length > 0 && (
                          <ul className="absolute z-30 left-3 right-3 bg-white border border-slate-200 rounded-xl shadow-xl mt-0.5 max-h-36 overflow-y-auto" data-scroll-box>
                            {rowSuggestions.map(s => (
                              <li key={s.id} onMouseDown={() => selectSuggestion(row._idx, s.name)}
                                className="px-3 py-2 text-xs hover:bg-brand-50 hover:text-brand-700 cursor-pointer flex items-center justify-between"
                              >
                                <span className="font-medium">{s.name}</span>
                                {s.district && <span className="text-slate-400">{s.district}</span>}
                              </li>
                            ))}
                          </ul>
                        )}
                        {method === "ai" && isExpanded && (
                          <div className="absolute z-40 left-3 right-3 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2 mt-1">
                            <p className="text-[10px] text-blue-700 flex items-center gap-1">
                              <Cpu className="w-3 h-3" />
                              AI Suggestion
                            </p>
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className={`text-[10px] font-bold px-2 py-1 rounded-lg border ${label.cls}`}>
                          {label.text}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <span className="flex items-center gap-1 text-xs text-slate-500">
                          {methodIcon(method)}
                          <span className="capitalize">{method ?? "—"}</span>
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          {isDone ? (
                            <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
                              <Check className="w-3.5 h-3.5" />Done
                            </span>
                          ) : (
                            <button onClick={() => acceptRow(row._idx)}
                              className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors font-semibold"
                            >
                              <Check className="w-3 h-3" />Accept
                            </button>
                          )}
                          <button onClick={() => setExpandedIdx(isExpanded ? null : row._idx)}
                            className="text-slate-400 hover:text-slate-600 transition-colors" title="More options"
                          >
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>

                    {isExpanded && (
                      <tr key={`exp-${row._idx}`} className="bg-slate-50/80 border-b border-slate-100">
                        <td colSpan={7} className="px-6 py-4">
                          <div className="flex flex-wrap items-center gap-6">
                            {(row.suggestions ?? []).length > 0 && (
                              <div>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Other suggestions</p>
                                <div className="flex flex-wrap gap-1.5">
                                  {row.suggestions!.map((s, si) => (
                                    <button key={si} onClick={() => selectSuggestion(row._idx, s.name)}
                                      className="flex items-center gap-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs hover:border-brand-400 hover:bg-brand-50 transition-all"
                                    >
                                      <span className={`w-1.5 h-1.5 rounded-full ${confidenceColor(s.confidence)}`} />
                                      {s.name}
                                      <span className="text-slate-400">{(s.confidence * 100).toFixed(0)}%</span>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            )}

                            {(row.suggestions ?? []).length === 0 && (
                              <p className="text-xs text-slate-400 italic">
                                No suggestions found — type a location in the input above to override manually.
                              </p>
                            )}

                            {row._area_override && row._area_override !== row._original_area && (
                              <label className="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" checked={row._save_alias ?? false}
                                  onChange={() => toggleSaveAlias(row._idx)}
                                  className="w-4 h-4 accent-brand-500 rounded" />
                                <span className="text-xs text-slate-600">
                                  Save <span className="font-mono bg-slate-100 px-1 rounded">{row._original_area}</span>
                                  {" → "}
                                  <span className="font-semibold text-brand-700">{row._area_override}</span> as alias
                                </span>
                                <span className="text-[10px] text-slate-400">(auto-recognized in future imports)</span>
                              </label>
                            )}

                            <button onClick={() => { updateArea(row._idx, ""); setExpandedIdx(null); }}
                              className="ml-auto flex items-center gap-1 text-xs text-red-500 hover:text-red-700 font-semibold"
                            >
                              <X className="w-3.5 h-3.5" />Clear area
                            </button>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}

              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-sm text-slate-400">
                    No rows match current filter
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-4">
        {unresolvedCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-2">
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            <p className="text-xs text-amber-700 font-semibold">
              {unresolvedCount} unresolved area{unresolvedCount !== 1 ? "s" : ""} will be imported as-is
            </p>
          </div>
        )}

        {saveMsg && (
          <p className="text-sm text-emerald-600 font-semibold flex items-center gap-1">
            <Check className="w-4 h-4" />{saveMsg}
          </p>
        )}

        <div className="ml-auto flex items-center gap-3">
          <button onClick={goBack} className="btn-secondary text-sm px-4 py-2">← Back</button>
          <button onClick={handleSaveAndProceed} disabled={saving}
            className="btn-primary group flex items-center gap-2 px-6 py-2.5 disabled:opacity-60"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving…" : "Save & Continue →"}
          </button>
        </div>
      </div>
    </div>
  );
}
