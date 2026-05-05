"use client";

import { useState } from "react";
import { Upload, ArrowLeft, Check, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { calcEndDate } from "@/lib/utils";
import Link from "next/link";
import ExcelJS from "exceljs";
import { format } from "date-fns";

interface ParsedRow {
  name: string;
  phone: string;
  plan: string;
  start_date: string;
  amount: string;
  payment_mode: string;
  _status?: "ok" | "duplicate" | "error";
  _error?: string;
}

// ── helpers ────────────────────────────────────────────────────────────────────

/** Resolve any ExcelJS cell value to a plain string */
function cellStr(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return String(value);
  // RichText
  if (typeof value === "object" && "richText" in (value as object)) {
    return (value as ExcelJS.CellRichTextValue).richText
      .map((r) => r.text)
      .join("")
      .trim();
  }
  // Date (ExcelJS returns JS Date objects for date cells)
  if (value instanceof Date) return format(value, "yyyy-MM-dd");
  // Shared formula result
  if (typeof value === "object" && "result" in (value as object)) {
    return cellStr(
      (value as ExcelJS.CellFormulaValue).result as ExcelJS.CellValue
    );
  }
  return String(value).trim();
}

/** Pull a cell by trying multiple case variants of a header name */
function getField(
  row: ExcelJS.Row,
  headers: string[],
  ...keys: string[]
): string {
  for (const key of keys) {
    const idx = headers.findIndex(
      (h) => h?.toLowerCase() === key.toLowerCase()
    );
    if (idx !== -1) {
      const cell = row.getCell(idx + 1); // ExcelJS columns are 1-indexed
      const val = cellStr(cell.value);
      if (val) return val;
    }
  }
  return "";
}

/** Convert an Excel serial date number to yyyy-MM-dd */
function excelSerialToDate(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  return format(new Date(ms), "yyyy-MM-dd");
}

// ── component ──────────────────────────────────────────────────────────────────

export default function ImportPage() {
  const [rows, setRows] = useState<ParsedRow[]>([]);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState(false);
  const [importResult, setImportResult] = useState({ success: 0, skipped: 0 });
  const supabase = createClient();

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    const buffer = await file.arrayBuffer();
    const wb = new ExcelJS.Workbook();

    // ExcelJS supports both .xlsx and .csv via different readers
    const isCSV = file.name.endsWith(".csv");
    if (isCSV) {
      await wb.csv.load(buffer);
    } else {
      await wb.xlsx.load(buffer);
    }

    const ws = wb.worksheets[0];
    if (!ws) return;

    // First row = headers
    const headerRow = ws.getRow(1);
    const headers: string[] = [];
    headerRow.eachCell({ includeEmpty: true }, (cell) => {
      headers.push(cellStr(cell.value));
    });

    const parsed: ParsedRow[] = [];

    ws.eachRow({ includeEmpty: false }, (row, rowIndex) => {
      if (rowIndex === 1) return; // skip header

      const name = getField(row, headers, "name", "Name", "NAME");
      const rawPhone = getField(
        row,
        headers,
        "phone",
        "Phone",
        "mobile",
        "Mobile"
      );
      const phone = rawPhone.replace(/\D/g, "").slice(-10);
      const planRaw = getField(row, headers, "plan", "Plan") || "monthly";
      const plan = planRaw.toLowerCase().trim();
      const rawDate = getField(
        row,
        headers,
        "start_date",
        "Start Date",
        "date"
      );
      const amount = getField(row, headers, "amount", "Amount") || "0";
      const pmRaw =
        getField(row, headers, "payment_mode", "Payment Mode") || "cash";
      const payment_mode = pmRaw.toLowerCase().trim();

      // Resolve start_date (could be serial number string from Excel)
      let start_date: string;
      const dateNum = Number(rawDate);
      if (!isNaN(dateNum) && rawDate !== "" && !rawDate.includes("-")) {
        start_date = excelSerialToDate(dateNum);
      } else {
        start_date = rawDate || format(new Date(), "yyyy-MM-dd");
      }

      let _error = "";
      if (!name) _error = "Missing name";
      else if (!phone || phone.length !== 10) _error = "Invalid phone";

      parsed.push({
        name,
        phone,
        plan: ["monthly", "quarterly", "annual"].includes(plan)
          ? plan
          : "monthly",
        start_date,
        amount,
        payment_mode: ["cash", "upi", "card"].includes(payment_mode)
          ? payment_mode
          : "cash",
        _status: _error ? "error" : "ok",
        _error,
      });
    });

    // Mark duplicates within file
    const phoneCount = new Map<string, number>();
    parsed.forEach((r) =>
      phoneCount.set(r.phone, (phoneCount.get(r.phone) ?? 0) + 1)
    );
    parsed.forEach((r) => {
      if (r._status !== "error" && phoneCount.get(r.phone)! > 1) {
        r._status = "duplicate";
        r._error = "Duplicate phone in file";
      }
    });

    setRows(parsed);
  }

  async function handleImport() {
    setImporting(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: gym } = await supabase
      .from("gyms")
      .select("id")
      .eq("owner_id", user.id)
      .single();

    if (!gym) return;

    const { data: existing } = await supabase
      .from("members")
      .select("phone")
      .eq("gym_id", gym.id);

    const existingPhones = new Set((existing ?? []).map((m) => m.phone));

    let success = 0;
    let skipped = 0;

    for (const row of rows) {
      if (row._status === "error") {
        skipped++;
        continue;
      }
      existingPhones.add(row.phone);

      const { data: member, error: mErr } = await supabase
        .from("members")
        .insert({ gym_id: gym.id, name: row.name, phone: row.phone })
        .select()
        .single();

      if (mErr || !member) {
        skipped++;
        continue;
      }

      const end_date = calcEndDate(row.start_date, row.plan as any);
      await supabase.from("memberships").insert({
        member_id: member.id,
        gym_id: gym.id,
        plan: row.plan,
        start_date: row.start_date,
        end_date,
        amount: parseInt(row.amount) || 0,
        payment_mode: row.payment_mode,
      });

      success++;
    }

    setImportResult({ success, skipped });
    setDone(true);
    setImporting(false);
  }

  const validRows = rows.filter((r) => r._status === "ok");
  const errorRows = rows.filter((r) => r._status !== "ok");

  return (
    <div>
      <div className="bg-white px-4 pt-10 pb-4 border-b border-gray-100 sticky top-0 z-10">
        <div className="flex items-center gap-3">
          <Link
            href="/members"
            className="p-2 -ml-2 rounded-xl active:bg-gray-100"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </Link>
          <h1 className="text-xl font-bold text-gray-900">Import Members</h1>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">
        {done ? (
          <div className="card p-6 text-center">
            <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Check className="w-7 h-7 text-green-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-1">
              Import Complete
            </h2>
            <p className="text-gray-600">
              {importResult.success} members imported · {importResult.skipped}{" "}
              skipped
            </p>
            <Link href="/members" className="btn-primary mt-4">
              View Members
            </Link>
          </div>
        ) : (
          <>
            {/* Upload area */}
            <div className="card p-4">
              <label className="flex flex-col items-center gap-3 py-8 border-2 border-dashed border-gray-200 rounded-xl cursor-pointer active:bg-gray-50">
                <Upload className="w-8 h-8 text-gray-400" />
                <div className="text-center">
                  <p className="font-medium text-gray-700">
                    Upload CSV or Excel file
                  </p>
                  <p className="text-sm text-gray-400 mt-0.5">
                    Columns: name, phone, plan, start_date, amount, payment_mode
                  </p>
                </div>
                <input
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleFile}
                  className="hidden"
                />
              </label>
            </div>

            {/* Template hint */}
            <div className="bg-blue-50 rounded-xl p-3 text-sm text-blue-700">
              <strong>Column headers (case-insensitive):</strong>
              <br />
              name · phone · plan (monthly/quarterly/annual) · start_date
              (YYYY-MM-DD) · amount · payment_mode (cash/upi/card)
            </div>

            {rows.length > 0 && (
              <>
                {/* Summary */}
                <div className="flex gap-3">
                  <div className="flex-1 bg-green-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-green-700">
                      {validRows.length}
                    </p>
                    <p className="text-xs text-green-600">Ready to import</p>
                  </div>
                  <div className="flex-1 bg-red-50 rounded-xl p-3 text-center">
                    <p className="text-xl font-bold text-red-700">
                      {errorRows.length}
                    </p>
                    <p className="text-xs text-red-600">Will be skipped</p>
                  </div>
                </div>

                {/* Preview */}
                <div className="card">
                  <p className="p-4 text-sm font-semibold text-gray-700 border-b border-gray-50">
                    Preview ({rows.length} rows)
                  </p>
                  <div className="divide-y divide-gray-50 max-h-80 overflow-y-auto">
                    {rows.map((row, i) => (
                      <div
                        key={i}
                        className={`p-3 flex items-center gap-3 ${
                          row._status === "ok" ? "" : "bg-red-50"
                        }`}
                      >
                        {row._status === "ok" ? (
                          <Check className="w-4 h-4 text-green-500 flex-shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">
                            {row.name || "(no name)"}
                          </p>
                          <p className="text-xs text-gray-500">
                            {row.phone} · {row.plan}
                          </p>
                          {row._error && (
                            <p className="text-xs text-red-500">{row._error}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {validRows.length > 0 && (
                  <button
                    onClick={handleImport}
                    disabled={importing}
                    className="btn-primary"
                  >
                    {importing
                      ? "Importing..."
                      : `Import ${validRows.length} Members`}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
