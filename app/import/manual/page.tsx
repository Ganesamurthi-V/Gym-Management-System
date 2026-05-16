"use client";

import { useState } from "react";
import { Upload, ArrowLeft, Check, AlertTriangle, ArrowRight, FileSpreadsheet } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import type { ImportedRow } from "../page";
import {
  cellStr,
  normalizePlan,
  normalizeGender,
  normalizePaymentMode,
  normalizeAge,
  normalizeDate,
  normalizeMemberNumber,
} from "@/lib/import/normalizers";
import { runImportPipeline } from "@/lib/import/pipeline";

interface ColumnMapping {
  excelColumn: string;
  dbField: string | null;
}

const DB_FIELDS = [
  { key: "name",          label: "Name",         required: true  },
  { key: "phone",         label: "Phone",        required: true  },
  { key: "member_number", label: "Member #",     required: false },
  { key: "plan",          label: "Plan",         required: false },
  { key: "start_date",    label: "Start Date",   required: false },
  { key: "amount",        label: "Amount",       required: false },
  { key: "payment_mode",  label: "Payment Mode", required: false },
  { key: "gender",        label: "Gender",       required: false },
  { key: "age",           label: "Age",          required: false },
  { key: "area",          label: "Area",         required: false },
];

export default function ManualImportPage() {
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [draggedExcel, setDraggedExcel] = useState<string | null>(null);
  const [processing, setProcessing] = useState(false);
  const [processStage, setProcessStage] = useState<string>("");

  const supabase = createClient();
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Security: file size limit 10MB
    if (file.size > 10 * 1024 * 1024) {
      alert("File too large. Maximum size is 10MB.");
      return;
    }

    // Clear all stale session state from any previous import session
    // so the review page never loads old data when a new file is uploaded
    sessionStorage.removeItem("import_rows");
    sessionStorage.removeItem("import_rows_original");
    sessionStorage.removeItem("import_review_state");
    sessionStorage.removeItem("import_cluster");
    sessionStorage.removeItem("import_has_id_col");

    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;

    const isCSV = file.name.endsWith(".csv");
    const wb = new ExcelJS.Workbook();
    if (isCSV) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const ws = wb.addWorksheet("Sheet1");
      // Security: strip CSV formula injection
      lines.forEach(line => ws.addRow(
        line.split(",").map(v => {
          const val = v.trim().replace(/^"|"$/g, "");
          return /^[=+\-@]/.test(val) ? "'" + val : val;
        })
      ));
    } else {
      await wb.xlsx.load(await file.arrayBuffer());
    }

    const ws = wb.worksheets[0];
    if (!ws) return;

    // Security: row count limit
    if (ws.rowCount - 1 > 50000) {
      alert("File has too many rows (max 50,000). Please split the file.");
      return;
    }

    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell: any) => headers.push(cellStr(cell.value)));

    const data: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row: any, rowIndex: number) => {
      if (rowIndex === 1) return;
      const rowData: string[] = [];
      headers.forEach((_, colIdx) => rowData.push(cellStr(row.getCell(colIdx + 1).value)));
      data.push(rowData);
    });

    setExcelColumns(headers);
    setRawData(data);
    setMappings(headers.map(col => ({ excelColumn: col, dbField: null })));
    setStep("map");
  }

  function handleDrop(excelCol: string, dbField: string) {
    setMappings(prev => prev.map(m => {
      if (m.excelColumn === excelCol) return { ...m, dbField };
      if (m.dbField === dbField) return { ...m, dbField: null };
      return m;
    }));
  }

  function handleUnmap(excelCol: string) {
    setMappings(prev => prev.map(m =>
      m.excelColumn === excelCol ? { ...m, dbField: null } : m
    ));
  }

  /** Build pre-normalized rows from raw data using the shared normalizers */
  function buildParsedRows(rows: string[][]): ImportedRow[] {
    const colIndexMap = new Map<string, number>();
    excelColumns.forEach((col, idx) => colIndexMap.set(col, idx));

    return rows.map((row, rowIdx) => {
      const get = (field: string): string => {
        const colIdx = colIndexMap.get(
          mappings.find(m => m.dbField === field)?.excelColumn ?? ""
        );
        return colIdx !== undefined ? row[colIdx] || "" : "";
      };

      const name          = get("name");
      const phone         = get("phone").replace(/\D/g, "").slice(-10);
      const plan          = normalizePlan(get("plan") || "monthly");
      const start_date    = normalizeDate(get("start_date"));
      const rawAmt        = get("amount").replace(/[^\d]/g, "");
      const amount        = rawAmt || "0"; // pipeline will fill from plan prices if "0"
      const payment_mode  = normalizePaymentMode(get("payment_mode") || "cash");
      const gender        = normalizeGender(get("gender"));
      const age           = normalizeAge(get("age"));
      const area          = get("area"); // raw — pipeline will normalize
      const { number: member_number } = normalizeMemberNumber(get("member_number"));

      let _error = "";
      if (!name)                                    _error = "Missing name";
      else if (phone && phone.length !== 10)        _error = "Invalid phone — WhatsApp reminders won't work";
      else if (age && (parseInt(age) < 1 || parseInt(age) > 120)) _error = "Age must be 1–120";

      return {
        name, phone, plan, start_date, amount, payment_mode,
        gender, age, area, member_number,
        _rowId: rowIdx,
        _status: !name ? "error" : "ok",
        _error,
      } as ImportedRow;
    });
  }

  async function handleProceedToEdit() {
    setProcessing(true);
    setProcessStage("🗺️ Normalizing areas…");

    const parsed = buildParsedRows(rawData);

    // Run the full shared pipeline — same as auto-import
    const { rows: pipelineRows } = await runImportPipeline(parsed, {
      supabase,
      onStage: stage => {
        if (stage === "areas")  setProcessStage("🗺️ Normalizing areas…");
        if (stage === "prices") setProcessStage("💰 Filling plan prices…");
        if (stage === "ids")    setProcessStage("🔢 Assigning member IDs…");
      },
    });

    sessionStorage.setItem("import_rows", JSON.stringify(pipelineRows));
    sessionStorage.setItem("import_rows_original", JSON.stringify(pipelineRows.map(r => ({ ...r }))));
    sessionStorage.setItem("import_has_id_col",
      mappings.some(m => m.dbField === "member_number") ? "1" : "0"
    );

    setProcessing(false);

    // Route to area review if any areas need attention — same logic as auto-import
    const needsReview = pipelineRows.some(
      r => r.area && ((r._area_confidence ?? 1) < 0.90 || r._area_matched_by === "unresolved")
    );
    router.push(needsReview ? "/import/review" : "/import/edit");
  }

  const mappedFields = new Set(mappings.filter(m => m.dbField).map(m => m.dbField));
  const requiredMapped = DB_FIELDS.filter(f => f.required).every(f => mappedFields.has(f.key));

  // ── Map step ──────────────────────────────────────────────────────────────
  if (step === "map") {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/import" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
            <ArrowLeft className="w-4 h-4" />Import
          </Link>
          <span className="text-slate-300">/</span>
          <h1 className="text-xl font-bold text-slate-900">Map Columns</h1>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Drag Excel columns to Database fields</p>
            <p className="text-xs text-amber-700 mt-1">
              Name and Phone are required. Click a mapped field to unmap it.
              Areas will be normalized and reviewed just like auto-import.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Excel columns */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Excel Columns ({excelColumns.length})</h3>
            <div className="space-y-2">
              {mappings.map(m => (
                <div
                  key={m.excelColumn}
                  draggable
                  onDragStart={() => setDraggedExcel(m.excelColumn)}
                  onDragEnd={() => setDraggedExcel(null)}
                  className={`px-4 py-3 rounded-lg border-2 cursor-move transition-all ${
                    m.dbField
                      ? "bg-emerald-50 border-emerald-300 text-emerald-800"
                      : "bg-white border-slate-200 text-slate-700 hover:border-brand-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-sm">{m.excelColumn}</span>
                    {m.dbField && (
                      <div className="flex items-center gap-2">
                        <ArrowRight className="w-4 h-4 text-emerald-600" />
                        <span className="text-xs font-semibold text-emerald-700">
                          {DB_FIELDS.find(f => f.key === m.dbField)?.label}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* DB fields */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-4">Database Fields</h3>
            <div className="space-y-2">
              {DB_FIELDS.map(field => {
                const mapped = mappings.find(m => m.dbField === field.key);
                return (
                  <div
                    key={field.key}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => draggedExcel && handleDrop(draggedExcel, field.key)}
                    onClick={() => mapped && handleUnmap(mapped.excelColumn)}
                    className={`px-4 py-3 rounded-lg border-2 transition-all ${
                      mapped
                        ? "bg-brand-50 border-brand-300 cursor-pointer hover:bg-brand-100"
                        : "bg-slate-50 border-dashed border-slate-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm text-slate-900">{field.label}</span>
                        {field.required && <span className="ml-2 text-xs text-red-500">*</span>}
                      </div>
                      {mapped && (
                        <span className="text-xs font-semibold text-brand-700 bg-white px-2 py-1 rounded">
                          {mapped.excelColumn}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Processing overlay */}
        {processing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
            <div className="relative w-16 h-16">
              <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
              <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
              <FileSpreadsheet className="absolute inset-0 m-auto w-6 h-6 text-brand-500" />
            </div>
            <p className="text-sm font-bold text-brand-700">{processStage}</p>
            <p className="text-xs text-slate-400">Running the full import pipeline…it may take upto 5-10 min 
            </p>
            <p className="text-xs text-slate-400">Do not close or change the tab until this process completes
            </p>
          </div>
        )}

        <button
          onClick={handleProceedToEdit}
          disabled={!requiredMapped || processing}
          className="btn-primary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check className="w-4 h-4" />
          {processing ? processStage : `Preview & Edit ${rawData.length} Rows →`}
        </button>
      </div>
    );
  }

  // ── Upload step ───────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/import" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900">
          <ArrowLeft className="w-4 h-4" />Import
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Manual Column Mapping</h1>
        <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold border border-amber-200">
          Drag & Drop
        </span>
      </div>

      <div className="card p-6">
        <label className="flex flex-col items-center gap-3 py-10 border-2 border-dashed border-slate-200 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all">
          <Upload className="w-8 h-8 text-slate-400" />
          <div className="text-center">
            <p className="font-semibold text-slate-700">Upload Excel or CSV file</p>
            <p className="text-sm text-slate-400 mt-0.5">You'll manually map columns to database fields</p>
          </div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </div>
    </div>
  );
}
