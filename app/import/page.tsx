"use client";

import { useState } from "react";
import { Upload, ArrowLeft, Check, AlertTriangle, Shuffle, FileSpreadsheet, Zap } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { matchAreaBatch } from "@/lib/geo/matchArea";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";

export interface ImportedRow {
  name: string;
  phone: string;
  plan: string;
  start_date: string;
  amount: string;
  payment_mode: string;
  gender: string;
  age: string;
  area: string;
  member_number: string;
  _rowId?: number;          // stable identity across deletions
  _status?: "ok" | "duplicate" | "error";
  _error?: string;
  _area_confidence?: number;
  _area_matched_by?: string;
  _id_auto?: boolean;       // true = was auto-assigned (no ID in file)
  _id_conflict?: boolean;   // true = user typed a conflicting ID
  _id_missing?: boolean;    // true = ID is empty/not provided
}

// ── Smart column alias dictionary ─────────────────────────────────────────────
const COLUMN_ALIASES: Record<string, string[]> = {
  name:         ["name", "fullname", "full name", "membername", "member name", "customer", "customername", "client", "clientname", "person", "studentname", "student name"],
  phone:        ["phone", "mobile", "mobileno", "mobile no", "phoneno", "phone no", "contact", "contactno", "contact no", "cell", "cellphone", "whatsapp", "mob", "ph", "phonenumber", "phone number", "mobilenumber", "mobile number"],
  member_number:["member_number", "membernumber", "member number", "member#", "member #", "mem#", "mem #", "memberid", "member id", "member_id", "#", "id", "no", "num", "number", "sl", "slno", "sl no", "serial", "serialno", "serial no", "serialnumber", "serial number", "personnumber", "person number", "personid", "person id", "regid", "reg id", "regno", "reg no", "registrationid", "registration id", "registrationnumber", "registration number", "gymid", "gym id", "gymno", "gym no", "rollno", "roll no", "rollnumber", "roll number"],
  plan:         ["plan", "membership", "membershipplan", "membership plan", "package", "subscription", "type", "membershiptype", "membership type", "plantype", "plan type", "duration"],
  start_date:   ["start_date", "startdate", "start date", "joiningdate", "joining date", "joindate", "join date", "date", "from", "fromdate", "from date", "admissiondate", "admission date", "enrolldate", "enroll date", "createdat", "created_at", "created at", "joineddate", "joined date", "joinedon", "joined on", "registrationdate", "registration date", "regdate", "reg date", "doj", "dateofjoining", "date of joining"],
  amount:       ["amount", "fee", "fees", "price", "cost", "amountpaid", "amount paid", "paidamount", "paid amount", "charge", "charges", "totalamount", "total amount", "feeamount", "fee amount", "membershipfee", "membership fee", "monthlyfee", "monthly fee", "subscriptionfee", "subscription fee", "planfee", "plan fee", "gymfee", "gym fee", "rs", "inr", "rupees", "paid"],
  payment_mode: ["payment_mode", "paymentmode", "payment mode", "mode", "paymode", "pay mode", "paymenttype", "payment type", "paytype", "method", "paymentmethod", "payment method", "transactiontype", "transaction type"],
  gender:       ["gender", "sex", "male/female", "m/f", "gendertype", "gender type"],
  age:          ["age", "years", "yrs", "memberage", "member age", "ageyears", "age years"],
  area:         ["area", "locality", "location", "address", "place", "zone", "region", "city", "town", "neighbourhood", "neighborhood", "sector", "colony", "street", "village"],
};

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

const ALIAS_MAP = new Map<string, string>();
for (const [field, aliases] of Object.entries(COLUMN_ALIASES)) {
  for (const alias of aliases) ALIAS_MAP.set(norm(alias), field);
}

function detectField(header: string): string | null {
  const n = norm(header);
  if (!n) return null;
  if (ALIAS_MAP.has(n)) return ALIAS_MAP.get(n)!;
  if (n.length >= 4) {
    for (const [alias, field] of ALIAS_MAP.entries()) {
      if (alias.length >= 4 && (n.includes(alias) || alias.includes(n))) return field;
    }
  }
  let bestField: string | null = null, bestDist = Infinity;
  for (const [alias, field] of ALIAS_MAP.entries()) {
    if (Math.abs(n.length - alias.length) > 3) continue;
    const dist = levenshtein(n, alias);
    const maxAllowed = alias.length <= 8 ? 1 : 2;
    if (dist <= maxAllowed && dist < bestDist) { bestDist = dist; bestField = field; }
  }
  return bestField;
}

function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, i) => {
    const field = detectField(h);
    if (field && !(field in map)) map[field] = i + 1;
  });
  return map;
}

// Use unknown instead of ExcelJS.CellValue — avoids static import requirement
function cellStr(value: unknown): string {
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

// Row typed as any — ExcelJS.Row not available without static import
function getCol(row: any, colMap: Record<string, number>, field: string): string {
  const idx = colMap[field];
  if (!idx) return "";
  return cellStr(row.getCell(idx).value);
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

const WORD_NUMS: Record<string, number> = {
  zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,
  eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70,
  eighty:80,ninety:90,
};

function normalizeAge(raw: string): string {
  if (!raw) return "";
  // strip suffixes like "yrs", "years", "yr", "y"
  const cleaned = raw.toLowerCase().replace(/\s*(years?|yrs?|y)\b/g, "").trim();
  // already a number
  const num = parseInt(cleaned);
  if (!isNaN(num) && num > 0 && num <= 120) return String(num);
  // word form: "twenty five", "twentyfive", "twenty-five"
  const words = cleaned.replace(/-/g, " ").split(/\s+/);
  let total = 0;
  for (const w of words) {
    const n = WORD_NUMS[w];
    if (n === undefined) return ""; // unrecognised word — drop it
    total += n;
  }
  return total > 0 && total <= 120 ? String(total) : "";
}

export default function ImportPage() {
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [parseStage, setParseStage] = useState(0); // 0=idle 1=reading 2=detecting 3=processing 4=normalizing-areas 5=done
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

    setParsing(true);
    setParseStage(1);

    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    setParseStage(2);

    const { data: { user } } = await supabase.auth.getUser();
    const { data: gym } = user
      ? await supabase.from("gyms").select("id").eq("owner_id", user.id).single()
      : { data: null };

    const [existingMembersRes, existingNumsRes] = gym
      ? await Promise.all([
          supabase.from("members").select("phone").eq("gym_id", gym.id) as Promise<{ data: { phone: string }[] | null }>,
          supabase.from("members").select("member_number").eq("gym_id", gym.id) as Promise<{ data: { member_number: number }[] | null }>,
        ])
      : [{ data: null }, { data: null }];

    const dbPhones = new Set((existingMembersRes.data ?? []).map(m => m.phone));
    const dbNums   = new Set((existingNumsRes.data ?? []).map(m => m.member_number));

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
    if (!ws) { setParsing(false); return; }

    // Security: row count limits
    const totalRows = ws.rowCount - 1;
    if (totalRows > 50000) {
      alert("File has too many rows (max 50,000). Please split the file.");
      setParsing(false);
      return;
    }

    const headers: string[] = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (cell: any) => headers.push(cellStr(cell.value)));
    const colMap = buildColumnMap(headers);

    const detected: Record<string, string> = {};
    for (const [field, idx] of Object.entries(colMap)) detected[field] = headers[idx - 1];
    setDetectedColumns(detected);
    setParseStage(3);

    const parsed: ImportedRow[] = [];
    ws.eachRow({ includeEmpty: false }, (row: any, rowIndex: number) => {
      if (rowIndex === 1) return;
      const name          = getCol(row, colMap, "name");
      const rawPhone      = getCol(row, colMap, "phone");
      const phone         = rawPhone.replace(/\D/g, "").slice(-10);
      const plan          = normalizePlan(getCol(row, colMap, "plan") || "monthly");
      const rawDate       = getCol(row, colMap, "start_date");
      const amount        = getCol(row, colMap, "amount") || "0";
      const payment_mode  = normalizePaymentMode(getCol(row, colMap, "payment_mode") || "cash");
      const gender        = normalizeGender(getCol(row, colMap, "gender"));
      const age           = normalizeAge(getCol(row, colMap, "age"));
      const rawArea       = getCol(row, colMap, "area");
      const member_number = getCol(row, colMap, "member_number");

      let start_date: string;
      const rawDateTrimmed = rawDate.trim();
      const datetimeMatch = rawDateTrimmed.match(/^(\d{4}-\d{2}-\d{2})/);
      if (datetimeMatch) {
        start_date = datetimeMatch[1];
      } else {
        const dateNum = Number(rawDateTrimmed);
        if (!isNaN(dateNum) && rawDateTrimmed !== "" && !rawDateTrimmed.includes("-") && !rawDateTrimmed.includes("/")) {
          start_date = excelSerialToDate(dateNum);
        } else if (rawDateTrimmed.includes("/")) {
          const parts = rawDateTrimmed.split("/");
          if (parts.length === 3) {
            const [a, b, c] = parts;
            start_date = `${c.length === 4 ? c : `20${c}`}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
          } else {
            start_date = format(new Date(), "yyyy-MM-dd");
          }
        } else {
          start_date = rawDateTrimmed || format(new Date(), "yyyy-MM-dd");
        }
      }

      let _error = "";
      if (!name) _error = "Missing name";
      else if (phone && phone.length !== 10) _error = "Invalid phone — WhatsApp reminders won't work";

      // area will be filled after batch normalization
      parsed.push({ name, phone, plan, start_date, amount, payment_mode, gender, age, area: rawArea, member_number, _rowId: parsed.length, _status: !name ? "error" : "ok", _error });
    });

    // Batch normalize all area values
    setParseStage(4);
    const BATCH_SIZE = 50;
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
        // Store suggestions and AI reasoning for the review page
        (r as any).suggestions = res.suggestions;
        (r as any).ai_reasoning = res.ai_reasoning;
      }
    });

    // Detect dataset cluster — stored in sessionStorage for the review page banner
    try {
      const clusterRes = await fetch('/api/geo/cluster-detect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: parsed.map(r => r.area).filter(Boolean) }),
      });
      if (clusterRes.ok) {
        sessionStorage.setItem('import_cluster', JSON.stringify(await clusterRes.json()));
      }
    } catch { }

    // Build assignedNums incrementally, checking both DB and file conflicts together
    const assignedNums = new Set<string>();

    function nextAvailable(): string {
      let n = 1;
      while (dbNums.has(n) || assignedNums.has(String(n))) n++;
      return String(n);
    }

    // Pass 1: fix phone duplicates within file (skip blank phones)
    const phoneCount = new Map<string, number>();
    parsed.forEach(r => {
      if (r.phone) phoneCount.set(r.phone, (phoneCount.get(r.phone) ?? 0) + 1);
    });
    parsed.forEach(r => {
      if (r._status !== "error" && r.phone && phoneCount.get(r.phone)! > 1) {
        r._status = "duplicate"; r._error = "Duplicate phone in file";
      }
    });

    // Pass 2: assign/fix member numbers — auto-assign if missing, flag conflicts for manual fix
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
        const inDB = dbNums.has(parseInt(r.member_number));
        const inFile = seenNums.has(r.member_number);
        if (inDB || inFile) {
          const newNum = nextAvailable();
          assignedNums.add(newNum);
          seenNums.add(newNum);
          r._id_conflict = true;
          r._error = `ID #${r.member_number} ${inDB ? 'exists in DB' : 'duplicate in file'} — auto-assigned #${newNum}`;
          r.member_number = newNum;
          r._id_auto = true;
        } else {
          seenNums.add(r.member_number);
          assignedNums.add(r.member_number);
        }
      }
    });

    // Pass 3: flag DB phone conflicts (skip blank phones)
    parsed.forEach(r => {
      if (r._status !== "error" && r._status !== "duplicate" && r.phone && dbPhones.has(r.phone)) {
        r._status = "duplicate"; r._error = "Phone already exists in database";
      }
    });

    setRows(parsed);
    setParseStage(5);
    setParsing(false);
  }

  function handleProceedToEdit() {
    sessionStorage.setItem("import_rows", JSON.stringify(rows));
    sessionStorage.setItem("import_rows_original", JSON.stringify(rows.map(r => ({ ...r }))));
    sessionStorage.setItem("import_has_id_col", detectedColumns.member_number ? "1" : "0");
    // Route to area review page if any areas have low confidence or are unresolved
    const needsReview = rows.some(
      r => r.area && ((r._area_confidence ?? 1) < 0.90 || r._area_matched_by === 'unresolved')
    );
    router.push(needsReview ? "/import/review" : "/import/edit");
  }

  const validRows = rows.filter(r => r._status === "ok");
  const errorRows = rows.filter(r => r._status !== "ok");

  const FIELD_LABELS: Record<string, string> = {
    member_number: "Member #", name: "Name", phone: "Phone", plan: "Plan", start_date: "Start Date",
    amount: "Amount", payment_mode: "Payment Mode", gender: "Gender", age: "Age", area: "Area",
  };

  return (
    <div className="max-w-3xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/members" className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />Members
        </Link>
        <span className="text-gray-300">/</span>
        <h1 className="text-xl font-bold text-gray-900">Import Members</h1>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 border-2 border-brand-300 bg-brand-50/30">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-bold text-brand-700">Auto Import</span>
            <span className="text-xs bg-brand-100 text-brand-600 px-2 py-0.5 rounded-full font-semibold">Active</span>
          </div>
          <p className="text-xs text-gray-500">Columns are auto-detected using smart fuzzy matching</p>
        </div>
        <Link href="/import/manual" className="card p-4 hover:border-gray-300 hover:bg-gray-50 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <Shuffle className="w-4 h-4 text-gray-500" />
            <span className="text-sm font-bold text-gray-700">Manual Mapping</span>
          </div>
          <p className="text-xs text-gray-500">Drag & drop to manually map Excel columns to database fields</p>
        </Link>
      </div>

      {/* Upload area */}
      <div className="card p-6">
        <label className={`flex flex-col items-center gap-3 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-all ${
            parsing ? 'border-brand-300 bg-brand-50/40 cursor-not-allowed' : 'border-gray-200 hover:border-brand-400 hover:bg-brand-50/30'
          }`}>
          {parsing ? (
            <div className="flex flex-col items-center gap-4 py-2">
              <div className="relative w-16 h-16">
                <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
                <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
                <FileSpreadsheet className="absolute inset-0 m-auto w-6 h-6 text-brand-500" />
              </div>
              <div className="text-center space-y-1">
                <p className="text-sm font-bold text-brand-700">
                  {parseStage === 1 && '📂 Reading your file...'}
                  {parseStage === 2 && '🔍 Detecting columns...'}
                  {parseStage === 3 && '⚡ Processing rows...'}
                  {parseStage === 4 && '🗺️ Normalizing areas...'}
                  {parseStage === 5 && '✅ Almost done!'}
                </p>
                <p className="text-xs text-gray-400">Your data is getting cooked 🍳</p>
              </div>
              <div className="w-48 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full animate-progress-bar" />
              </div>
              <div className="flex gap-1.5">
                {[0,1,2].map(i => (
                  <div key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce-dot"
                    style={{ animationDelay: `${i * 0.2}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <>
              <Upload className="w-8 h-8 text-gray-400" />
              <div className="text-center">
                <p className="font-semibold text-gray-700">Upload CSV or Excel file</p>
                <p className="text-sm text-gray-400 mt-0.5">Columns are auto-detected — any header name works</p>
              </div>
            </>
          )}
          <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" disabled={parsing} />
        </label>
      </div>

      {/* Detected columns */}
      {Object.keys(detectedColumns).length > 0 && (
        <div className="card p-4">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Detected Columns</p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                detectedColumns[field] ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-gray-50 text-gray-400 border-gray-200"
              }`}>
                {detectedColumns[field] ? <Check className="w-3 h-3" /> : <span>–</span>}
                {label}
                {detectedColumns[field] && <span className="opacity-60">← "{detectedColumns[field]}"</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {rows.length > 0 && (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{validRows.filter(r => !r._error).length}</p>
              <p className="text-sm text-gray-500 mt-0.5">Ready</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-amber-500">{validRows.filter(r => r._id_auto).length}</p>
              <p className="text-sm text-gray-500 mt-0.5">ID auto-assigned</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-red-500">{errorRows.length}</p>
              <p className="text-sm text-gray-500 mt-0.5">Will be skipped</p>
            </div>
            <div
              className="card p-4 text-center cursor-pointer hover:border-amber-300 transition-colors"
              onClick={() => {
                if (rows.some(r => r.area && (r._area_confidence ?? 1) < 0.90)) handleProceedToEdit();
              }}
            >
              <p className="text-2xl font-bold text-orange-500">
                {rows.filter(r => r.area && (r._area_confidence ?? 1) < 0.90).length}
              </p>
              <p className="text-sm text-gray-500 mt-0.5">Areas need review</p>
              {rows.filter(r => r._area_matched_by === 'ai').length > 0 && (
                <p className="text-[10px] text-blue-500 mt-0.5">
                  {rows.filter(r => r._area_matched_by === 'ai').length} AI-inferred
                </p>
              )}
            </div>
          </div>

          <div className="card overflow-hidden">
            <p className="px-5 py-3.5 text-sm font-bold text-gray-700 border-b border-gray-100">
              Preview ({rows.length} rows)
            </p>
            <div className="overflow-x-auto max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide"></th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">#</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Phone</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Plan</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Age</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Area ✦</th>
                    <th className="text-left px-4 py-2.5 text-xs font-bold text-gray-400 uppercase tracking-wide">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {rows.map((row, i) => (
                    <tr key={i} className={row._status !== "ok" ? "bg-red-50" : row._error ? "bg-amber-50" : "hover:bg-gray-50"}>
                      <td className="px-4 py-2.5">
                        {row._status !== "ok"
                          ? <AlertTriangle className="w-4 h-4 text-red-500" />
                          : row._error
                          ? <AlertTriangle className="w-4 h-4 text-amber-500" />
                          : <Check className="w-4 h-4 text-emerald-500" />}
                      </td>
                      <td className="px-4 py-2.5 text-gray-400 font-mono text-xs">{row.member_number || "—"}</td>
                      <td className="px-4 py-2.5 font-medium text-gray-900">
                        {row.name || <span className="text-gray-400">(no name)</span>}
                        {row._error && row._status !== "ok" && <p className="text-xs text-red-500 mt-0.5">{row._error}</p>}
                        {row._error && row._status === "ok" && <p className="text-xs text-amber-600 mt-0.5">{row._error}</p>}
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">{row.phone}</td>
                      <td className="px-4 py-2.5 text-gray-500 capitalize">{row.plan}</td>
                      <td className="px-4 py-2.5 text-gray-500">{row.age || "—"}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {row.area ? (
                            <>
                              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                                (row._area_confidence ?? 0) >= 0.90 ? 'bg-emerald-500' :
                                (row._area_confidence ?? 0) >= 0.70 ? 'bg-amber-400' :
                                row._area_matched_by === 'unresolved' ? 'bg-red-400' : 'bg-gray-300'
                              }`} title={`Confidence: ${((row._area_confidence ?? 0) * 100).toFixed(0)}% (${row._area_matched_by ?? 'unknown'})`} />
                              <span className="text-gray-500 text-xs">{row.area}</span>
                            </>
                          ) : <span className="text-gray-300">—</span>}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-gray-500">₹{row.amount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {validRows.length > 0 && (
            <button onClick={handleProceedToEdit}
              className="btn-primary group relative overflow-hidden">
              <span className="relative z-10 flex items-center justify-center gap-2">
                <Zap className="w-4 h-4" />
                {rows.some(r => r.area && (r._area_confidence ?? 1) < 0.90)
                  ? `Review Areas & Continue →`
                  : `Edit & Review ${validRows.length} Members →`}
              </span>
              <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
