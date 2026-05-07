"use client";

import { useState } from "react";
import { Upload, ArrowLeft, Check, AlertTriangle, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { matchArea } from "@/lib/areas";
import Link from "next/link";
import ExcelJS from "exceljs";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import type { ImportedRow } from "../page";

interface ColumnMapping {
  excelColumn: string;
  dbField: string | null;
}

const DB_FIELDS = [
  { key: "name",         label: "Name",         required: true  },
  { key: "phone",        label: "Phone",        required: true  },
  { key: "member_number",label: "Member #",     required: false },
  { key: "plan",         label: "Plan",         required: false },
  { key: "start_date",   label: "Start Date",   required: false },
  { key: "amount",       label: "Amount",       required: false },
  { key: "payment_mode", label: "Payment Mode", required: false },
  { key: "gender",       label: "Gender",       required: false },
  { key: "age",          label: "Age",          required: false },
  { key: "area",         label: "Area",         required: false },
];

function cellStr(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  if (typeof value === "object" && "richText" in (value as object))
    return (value as ExcelJS.CellRichTextValue).richText.map(r => r.text).join("").trim();
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  if (typeof value === "object" && "result" in (value as object))
    return cellStr((value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue);
  return String(value).trim();
}

function excelSerialToDate(serial: number): string {
  return format(new Date(Math.round((serial - 25569) * 86400 * 1000)), "yyyy-MM-dd");
}

function normalizeGender(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["m", "male", "boy", "man", "gents", "gent"].includes(v)) return "male";
  if (["f", "female", "girl", "woman", "ladies", "lady"].includes(v)) return "female";
  if (["o", "other", "others", "na", "n/a"].includes(v)) return "other";
  return "";
}

function normalizePlan(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["monthly", "month", "1month", "1 month", "1m", "30days", "30 days"].includes(v)) return "monthly";
  if (["quarterly", "quarter", "3months", "3 months", "3m", "90days", "90 days"].includes(v)) return "quarterly";
  if (["annual", "yearly", "year", "12months", "12 months", "12m", "1year", "1 year", "365days"].includes(v)) return "annual";
  return "monthly";
}

function normalizePaymentMode(raw: string): string {
  const v = raw.toLowerCase().trim();
  if (["cash", "c", "hand", "inhand"].includes(v)) return "cash";
  if (["upi", "gpay", "googlepay", "phonepay", "phonepe", "paytm", "bhim", "online", "neft", "imps"].includes(v)) return "upi";
  if (["card", "debit", "credit", "debitcard", "creditcard", "swipe"].includes(v)) return "card";
  return "cash";
}

function normalizeDate(raw: string): string {
  const t = raw.trim();
  const m = t.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const n = Number(t);
  if (!isNaN(n) && t !== "" && !t.includes("-") && !t.includes("/")) return excelSerialToDate(n);
  if (t.includes("/")) {
    const parts = t.split("/");
    if (parts.length === 3) {
      const [a, b, c] = parts;
      return `${c.length === 4 ? c : `20${c}`}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
    }
  }
  return t || format(new Date(), "yyyy-MM-dd");
}

export default function ManualImportPage() {
  const [step, setStep] = useState<"upload" | "map">("upload");
  const [excelColumns, setExcelColumns] = useState<string[]>([]);
  const [mappings, setMappings] = useState<ColumnMapping[]>([]);
  const [rawData, setRawData] = useState<string[][]>([]);
  const [draggedExcel, setDraggedExcel] = useState<string | null>(null);
  const [dbNums, setDbNums] = useState<Set<number>>(new Set());
  const [dbPhones, setDbPhones] = useState<Set<string>>(new Set());

  const supabase = createClient();
  const router = useRouter();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const isCSV = file.name.endsWith(".csv");
    const wb = new ExcelJS.Workbook();
    if (isCSV) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const ws = wb.addWorksheet("Sheet1");
      lines.forEach(line => ws.addRow(line.split(",").map(v => v.trim().replace(/^"|"$/g, ""))));
    } else {
      await wb.xlsx.load(await file.arrayBuffer());
    }

    const ws = wb.worksheets[0];
    if (!ws) return;

    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, cell => headers.push(cellStr(cell.value)));
    const data: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row, rowIndex) => {
      if (rowIndex === 1) return;
      const rowData: string[] = [];
      headers.forEach((_, colIdx) => rowData.push(cellStr(row.getCell(colIdx + 1).value)));
      data.push(rowData);
    });

    // Fetch DB state once
    const { data: { user } } = await supabase.auth.getUser();
    const { data: gym } = user
      ? await supabase.from("gyms").select("id").eq("owner_id", user.id).single()
      : { data: null };
    if (gym) {
      const [phonesRes, numsRes] = await Promise.all([
        supabase.from("members").select("phone").eq("gym_id", gym.id),
        supabase.from("members").select("member_number").eq("gym_id", gym.id),
      ]);
      setDbPhones(new Set((phonesRes.data ?? []).map((m: any) => m.phone)));
      setDbNums(new Set((numsRes.data ?? []).map((m: any) => m.member_number)));
    }

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

  function buildNormalizedRows(rows: string[][]): ImportedRow[] {
    const colIndexMap = new Map<string, number>();
    excelColumns.forEach((col, idx) => colIndexMap.set(col, idx));

    return rows.map(row => {
      const get = (field: string) => {
        const colIdx = colIndexMap.get(
          mappings.find(m => m.dbField === field)?.excelColumn ?? ""
        );
        return colIdx !== undefined ? row[colIdx] || "" : "";
      };

      const name         = get("name");
      const phone        = get("phone").replace(/\D/g, "").slice(-10);
      const plan         = normalizePlan(get("plan") || "monthly");
      const start_date   = normalizeDate(get("start_date"));
      const amount       = get("amount") || "0";
      const payment_mode = normalizePaymentMode(get("payment_mode") || "cash");
      const gender       = normalizeGender(get("gender"));
      const age          = get("age").replace(/\D/g, "");
      const area         = matchArea(get("area"));
      const member_number = get("member_number");

      // Constraint validation
      let _error = "";
      if (!name)                        _error = "Missing name";
      else if (!phone || phone.length !== 10) _error = "Invalid phone";
      else if (age && (parseInt(age) < 1 || parseInt(age) > 120)) _error = "Age must be 1–120";

      return {
        name, phone, plan, start_date, amount, payment_mode,
        gender, age, area, member_number,
        _status: _error ? "error" : "ok",
        _error,
      } as ImportedRow;
    });
  }

  function resolveIds(parsed: ImportedRow[]): ImportedRow[] {
    const fileNumsUsed = new Set(
      parsed.filter(r => r._status !== "error" && r.member_number).map(r => parseInt(r.member_number))
    );
    let next = 1;
    while (dbNums.has(next) || fileNumsUsed.has(next)) next++;

    const assigned = new Set<string>();
    parsed.forEach(r => {
      if (r._status === "error") return;
      if (r.member_number) {
        if (assigned.has(r.member_number)) {
          while (dbNums.has(next) || assigned.has(String(next))) next++;
          const newNum = String(next++);
          r._error = `ID #${r.member_number} duplicate — auto-assigned #${newNum}`;
          r.member_number = newNum;
          assigned.add(newNum);
        } else {
          assigned.add(r.member_number);
        }
      }
    });

    // Mark phone duplicates within file
    const phoneCount = new Map<string, number>();
    parsed.forEach(r => phoneCount.set(r.phone, (phoneCount.get(r.phone) ?? 0) + 1));
    parsed.forEach(r => {
      if (r._status !== "error" && phoneCount.get(r.phone)! > 1) {
        r._status = "duplicate"; r._error = "Duplicate phone in file";
      }
    });

    // Mark DB conflicts
    parsed.forEach(r => {
      if (r._status !== "error") {
        if (dbPhones.has(r.phone)) {
          r._status = "duplicate"; r._error = "Phone already exists in database";
        } else if (r.member_number && dbNums.has(parseInt(r.member_number))) {
          while (dbNums.has(next) || assigned.has(String(next))) next++;
          const newNum = String(next++);
          r._error = `ID #${r.member_number} exists in DB — auto-assigned #${newNum}`;
          r.member_number = newNum;
          assigned.add(newNum);
        }
      }
    });

    return parsed;
  }

  function handleProceedToEdit() {
    const normalized = buildNormalizedRows(rawData);
    const resolved = resolveIds(normalized);
    sessionStorage.setItem("import_rows", JSON.stringify(resolved));
    sessionStorage.setItem("import_rows_original", JSON.stringify(resolved.map(r => ({ ...r }))));
    router.push("/import/edit");
  }

  const mappedFields = new Set(mappings.filter(m => m.dbField).map(m => m.dbField));
  const requiredMapped = DB_FIELDS.filter(f => f.required).every(f => mappedFields.has(f.key));

  if (step === "map") {
    return (
      <div className="max-w-6xl mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <Link href="/import" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
            <ArrowLeft className="w-4 h-4" />Import
          </Link>
          <span className="text-gray-300">/</span>
          <h1 className="text-xl font-bold text-gray-900">Map Columns</h1>
        </div>

        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-amber-800">Drag Excel columns to Database fields</p>
            <p className="text-xs text-amber-700 mt-1">
              Name and Phone are required. Click a mapped field to unmap it.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6">
          {/* Excel columns */}
          <div className="card p-5">
            <h3 className="text-sm font-bold text-gray-700 mb-4">Excel Columns ({excelColumns.length})</h3>
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
                      : "bg-white border-gray-200 text-gray-700 hover:border-brand-300"
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
            <h3 className="text-sm font-bold text-gray-700 mb-4">Database Fields</h3>
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
                        : "bg-gray-50 border-dashed border-gray-300"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium text-sm text-gray-900">{field.label}</span>
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

        <button onClick={handleProceedToEdit} disabled={!requiredMapped} className="btn-primary">
          <Check className="w-4 h-4" />
          Preview & Edit {rawData.length} Rows →
        </button>
      </div>
    );
  }

  // ── Upload ────────────────────────────────────────────────────────────────
  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/import" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900">
          <ArrowLeft className="w-4 h-4" />Import
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Manual Column Mapping</h1>
        <span className="ml-auto text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-semibold border border-amber-200">
          Drag & Drop
        </span>
      </div>

      <div className="card p-6">
        <label className="flex flex-col items-center gap-3 py-10 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-all">
          <Upload className="w-8 h-8 text-gray-400" />
          <div className="text-center">
            <p className="font-semibold text-gray-700">Upload Excel or CSV file</p>
            <p className="text-sm text-gray-400 mt-0.5">You'll manually map columns to database fields</p>
          </div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
        </label>
      </div>
    </div>
  );
}
