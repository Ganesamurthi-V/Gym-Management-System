"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { Upload, ArrowLeft, Check, AlertTriangle, Shuffle, FileSpreadsheet, Zap, X, RefreshCw } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { format } from "date-fns";
import { useRouter } from "next/navigation";
import {
  cellStr as sharedCellStr,
  excelSerialToDate as sharedExcelSerialToDate,
  normalizePlan,
  normalizeGender,
  normalizePaymentMode,
  normalizeAge,
  normalizeMemberNumber,
} from "@/lib/import/normalizers";
import { runImportPipeline } from "@/lib/import/pipeline";
import { useLenisScroll } from "@/lib/hooks/useLenisScroll";

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
  /** Original ID from the source file, preserved as legacy reference */
  legacy_member_id?: string;
  _rowId?: number;
  _status?: "ok" | "duplicate" | "error";
  _error?: string;
  _area_confidence?: number;
  _area_matched_by?: string;
  _id_auto?: boolean;
  _id_conflict?: boolean;
  _id_missing?: boolean;
}

const COLUMN_ALIASES: Record<string, string[]> = {
  name: [
    // Generic
    "name", "fullname", "full name", "full_name",
    // Client/Customer variants
    "client", "clientname", "client name", "client_name",
    "customer", "customername", "customer name", "customer_name",
    // Member variants
    "membername", "member name", "member_name",
    // Person/Student
    "person", "personname", "person name", "person_name",
    "studentname", "student name", "student_name",
    // Subscriber/User
    "subscriber", "subscribername", "subscriber name",
    "username", "user name", "user_name",
    // Indian gym software exports
    "gymname", "gym member", "trainee", "traineename",
    "participant", "participantname",
    // First + Last combined
    "firstname", "first name", "first_name",
    "lastname", "last name", "last_name",
    "fname", "lname", "f_name", "l_name",
    // Display name
    "displayname", "display name", "display_name",
    "contactname", "contact name", "contact_name",
  ],

  phone: [
    // Generic
    "phone", "phoneno", "phone no", "phone_no",
    "phonenumber", "phone number", "phone_number",
    // Mobile
    "mobile", "mobileno", "mobile no", "mobile_no",
    "mobilenumber", "mobile number", "mobile_number",
    // Contact
    "contact", "contactno", "contact no", "contact_no",
    "contactnumber", "contact number", "contact_number",
    // Cell/WhatsApp
    "cell", "cellphone", "cell phone", "cell_phone",
    "whatsapp", "whatsappno", "whatsapp no", "whatsapp_no",
    "whatsappnumber", "whatsapp number",
    // Short forms
    "mob", "ph", "tel", "telephone",
    // Indian variants
    "mobileno.", "ph no", "phno", "phone.", "mobile.",
    "contactno.", "contact.", "mob no", "mobno",
    // Primary/Secondary
    "primaryphone", "primary phone", "primary_phone",
    "primarymobile", "primary mobile",
    "phone1", "phone 1", "mobile1", "mobile 1",
  ],

  member_number: [
    // Standard
    "member_number", "membernumber", "member number",
    // Client code — must be listed BEFORE name aliases to win priority
    "clientcode", "client code", "client_code",
    "customercode", "customer code", "customer_code",
    "membercode", "member code", "member_code",
    "memberid", "member id", "member_id",
    "member#", "member #", "mem#", "mem #",
    // ID variants
    "id", "no", "num", "number", "#",
    "clientid", "client id", "client_id",
    "customerid", "customer id", "customer_id",
    "personid", "person id", "person_id",
    "userid", "user id", "user_id",
    "subscriberId", "subscriber id", "subscriber_id",
    // Serial/Roll
    "sl", "slno", "sl no", "sl_no",
    "serial", "serialno", "serial no", "serial_no",
    "serialnumber", "serial number", "serial_number",
    "rollno", "roll no", "roll_no",
    "rollnumber", "roll number", "roll_number",
    // Registration
    "regid", "reg id", "reg_id",
    "regno", "reg no", "reg_no",
    "registrationid", "registration id", "registration_id",
    "registrationnumber", "registration number", "registration_number",
    "regnum", "reg num", "reg_num",
    // Gym-specific
    "gymid", "gym id", "gym_id",
    "gymno", "gym no", "gym_no",
    "gymmemberid", "gym member id",
    "membercode", "member code", "member_code",
    "membershipid", "membership id", "membership_id",
    "membershipno", "membership no", "membership_no",
    // Admission
    "admissionno", "admission no", "admission_no",
    "admissionid", "admission id", "admission_id",
    "admno", "adm no", "adm_no",
    // Trainee/Student
    "traineeid", "trainee id", "trainee_id",
    "studentid", "student id", "student_id",
    "participantid", "participant id", "participant_id",
    // Short
    "mid", "cid", "uid", "pid",
    "personnumber", "person number", "person_number",
  ],

  plan: [
    // Standard
    "plan", "planname", "plan name", "plan_name",
    "plantype", "plan type", "plan_type",
    // Membership
    "membership", "membershipplan", "membership plan", "membership_plan",
    "membershiptype", "membership type", "membership_type",
    "membershipname", "membership name", "membership_name",
    // Package/Subscription
    "package", "packagename", "package name", "package_name",
    "packagetype", "package type", "package_type",
    "subscription", "subscriptiontype", "subscription type", "subscription_type",
    "subscriptionplan", "subscription plan", "subscription_plan",
    // Duration/Period
    "duration", "period", "tenure",
    "planperiod", "plan period", "plan_period",
    "membershiptier", "membership tier", "tier",
    // Category/Type
    "type", "category", "membershipcategory",
    "pricingplan", "pricing plan", "pricing_plan",
    // Indian gym exports
    "gymplan", "gym plan", "gym_plan",
    "gympackage", "gym package", "gym_package",
    "scheme", "schemename", "scheme name",
    "batch", "batchname", "batch name",
  ],

  start_date: [
    // Standard
    "start_date", "startdate", "start date",
    "startingdate", "starting date", "starting_date",
    // Joining
    "joiningdate", "joining date", "joining_date",
    "joindate", "join date", "join_date",
    "joinedon", "joined on", "joined_on",
    "joineddate", "joined date", "joined_date",
    "dateofjoining", "date of joining", "date_of_joining",
    "doj",
    // Admission
    "admissiondate", "admission date", "admission_date",
    "admdate", "adm date", "adm_date",
    // Enrollment
    "enrolldate", "enroll date", "enroll_date",
    "enrollmentdate", "enrollment date", "enrollment_date",
    "enrolledon", "enrolled on", "enrolled_date",
    // Registration
    "registrationdate", "registration date", "registration_date",
    "regdate", "reg date", "reg_date",
    // Generic date
    "date", "from", "fromdate", "from date", "from_date",
    "createdat", "created_at", "created at", "created_date",
    "activationdate", "activation date", "activation_date",
    "membershipstart", "membership start", "membership_start",
    "planstart", "plan start", "plan_start",
    "subscriptionstart", "subscription start",
    "commencementdate", "commencement date",
    "effectivedate", "effective date", "effective_date",
    "validfrom", "valid from", "valid_from",
    "startson", "starts on",
  ],

  amount: [
    // Generic
    "amount", "amountpaid", "amount paid", "amount_paid",
    "paidamount", "paid amount", "paid_amount",
    // Fee
    "fee", "fees", "feeamount", "fee amount", "fee_amount",
    "membershipfee", "membership fee", "membership_fee",
    "planfee", "plan fee", "plan_fee",
    "gymfee", "gym fee", "gym_fee",
    "subscriptionfee", "subscription fee", "subscription_fee",
    "monthlyfee", "monthly fee", "monthly_fee",
    "annualfee", "annual fee", "annual_fee",
    // Price/Cost
    "price", "cost", "charge", "charges",
    "totalamount", "total amount", "total_amount",
    "totalfee", "total fee", "total_fee",
    "totalpaid", "total paid", "total_paid",
    // Payment
    "payment", "paymentamount", "payment amount", "payment_amount",
    "paidsum", "paid sum",
    // Currency
    "rs", "inr", "rupees", "₹",
    "paid", "collected",
    // Package amount
    "packageamount", "package amount", "package_amount",
    "packageprice", "package price", "package_price",
    "planprice", "plan price", "plan_price",
    "planrate", "plan rate", "plan_rate",
    // Received
    "amountreceived", "amount received", "amount_received",
    "receivedamount", "received amount", "received_amount",
    "feecollected", "fee collected", "fee_collected",
  ],

  payment_mode: [
    // Standard
    "payment_mode", "paymentmode", "payment mode",
    "paymenttype", "payment type", "payment_type",
    "paymentmethod", "payment method", "payment_method",
    // Short
    "mode", "paymode", "pay mode", "pay_mode",
    "paytype", "pay type", "pay_type",
    "method", "transactiontype", "transaction type", "transaction_type",
    // How paid
    "paidby", "paid by", "paid_by",
    "paidvia", "paid via", "paid_via",
    "paymentvia", "payment via",
    "modeofpayment", "mode of payment", "mode_of_payment",
    "paymentstatus", "payment status",
  ],

  gender: [
    // Standard
    "gender", "sex",
    "gendertype", "gender type", "gender_type",
    // Variants
    "male/female", "m/f", "m/f/o",
    "gendername", "gender name",
    // Indian forms
    "sex/gender", "gender/sex",
  ],

  age: [
    // Standard
    "age", "years", "yrs",
    // years_old, age_years variants
    "yearsold", "years old", "years_old",
    "ageyrs", "age yrs", "age_yrs",
    "memberage", "member age", "member_age",
    "ageyears", "age years", "age_years",
    "ageinyyears", "age in years",
    // Date of birth (we'll parse to age)
    "dob", "dateofbirth", "date of birth", "date_of_birth",
    "birthdate", "birth date", "birth_date",
    "birthday", "birth day",
    "bornon", "born on",
    // Current age
    "currentage", "current age", "current_age",
    "clientage", "client age", "client_age",
    "customerage", "customer age",
  ],

  area: [
    // Standard
    "area", "areaname", "area name", "area_name",
    "locality", "localityname", "locality name",
    "location", "locationname", "location name", "location_name",
    // Address variants
    "address", "addr", "fulladdress", "full address", "full_address",
    "homeaddress", "home address", "home_address",
    "residentialaddress", "residential address",
    "permanentaddress", "permanent address",
    // Place
    "place", "placename", "place name", "place_name",
    "zone", "zonename", "zone name", "zone_name",
    "region", "regionname", "region name",
    // City/Town
    "city", "cityname", "city name", "city_name",
    "town", "townname", "town name",
    "village", "villagename", "village name",
    // Neighborhood
    "neighbourhood", "neighborhood",
    "sector", "sectorname", "sector name",
    "colony", "colonyname", "colony name",
    "street", "streetname", "street name",
    "landmark", "nearbylandmark", "nearby landmark",
    // Postal
    "pincode", "pin code", "pin_code",
    "zipcode", "zip code", "zip_code",
    "postalcode", "postal code", "postal_code",
    // Indian specific
    "taluk", "taluka", "mandal", "ward",
    "district", "districtname", "district name",
    "nagar", "nagara",
  ],
};

function norm(s: string): string { return s.toLowerCase().replace(/[^a-z0-9]/g, ""); }

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

  // 1. Exact match — highest priority
  if (ALIAS_MAP.has(n)) return ALIAS_MAP.get(n)!;

  // 2. Substring match — only when the alias is a meaningful standalone word (≥5 chars)
  //    AND the match is unambiguous (only one field matches)
  if (n.length >= 5) {
    const substringMatches: string[] = [];
    for (const [alias, field] of ALIAS_MAP.entries()) {
      if (alias.length >= 5 && n === alias) { substringMatches.push(field); break; }
      // alias is fully contained in header (e.g. "phone" in "primaryphone")
      if (alias.length >= 5 && n.includes(alias) && !substringMatches.includes(field)) {
        substringMatches.push(field);
      }
    }
    // Only use substring match if exactly one field matched — avoids ambiguity
    if (substringMatches.length === 1) return substringMatches[0];
  }

  // 3. Fuzzy match — tight tolerance, skip if length difference is too large
  let bestField: string | null = null, bestDist = Infinity;
  for (const [alias, field] of ALIAS_MAP.entries()) {
    if (Math.abs(n.length - alias.length) > 2) continue; // tighter than before
    const dist = levenshtein(n, alias);
    // Very tight: only 1 edit allowed, and only for aliases ≥ 6 chars
    const maxAllowed = alias.length >= 6 ? 1 : 0;
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

function cellStr(value: unknown): string { return sharedCellStr(value); }

function getCol(row: any, colMap: Record<string, number>, field: string): string {
  const idx = colMap[field];
  if (!idx) return "";
  return cellStr(row.getCell(idx).value);
}

function excelSerialToDate(serial: number): string { return sharedExcelSerialToDate(serial); }

const FIELD_LABELS: Record<string, string> = {
  member_number: "Member #", name: "Name", phone: "Phone", plan: "Plan",
  start_date: "Start Date", amount: "Amount", payment_mode: "Payment Mode",
  gender: "Gender", age: "Age", area: "Area",
};

const STAGES = [
  { id: 1, emoji: "📂", label: "Reading file" },
  { id: 2, emoji: "🔍", label: "Detecting columns" },
  { id: 3, emoji: "⚡", label: "Processing rows" },
  { id: 4, emoji: "🗺️", label: "Normalizing areas", note: "can take 5–10 min" },
  { id: 5, emoji: "✅", label: "Finalizing" },
];

export default function ImportPage() {
  const [rows, setRows] = useState<ImportedRow[]>([]);
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [parseStage, setParseStage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const tableScrollRef = useRef<HTMLDivElement>(null);

  // Use Lenis smooth scroll on the preview box container
  useLenisScroll(tableScrollRef, [rows]);

  const supabase = createClient();
  const router = useRouter();

  async function processFile(file: File) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large. Maximum size is 10MB."); return; }

    setFileName(file.name);
    sessionStorage.removeItem("import_rows");
    sessionStorage.removeItem("import_rows_original");
    sessionStorage.removeItem("import_review_state");
    sessionStorage.removeItem("import_cluster");
    sessionStorage.removeItem("import_has_id_col");

    setParsing(true);
    setParseStage(1);

    const ExcelJSModule = await import("exceljs");
    const ExcelJS = ExcelJSModule.default || ExcelJSModule;
    setParseStage(2);

    const isCSV = file.name.endsWith(".csv");
    const wb = new ExcelJS.Workbook();
    if (isCSV) {
      const text = await file.text();
      const lines = text.split(/\r?\n/).filter(Boolean);
      const ws = wb.addWorksheet("Sheet1");
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
    if (ws.rowCount - 1 > 50000) { alert("File has too many rows (max 50,000)."); setParsing(false); return; }

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
      const name         = getCol(row, colMap, "name");
      const rawPhone     = getCol(row, colMap, "phone");
      const phone        = rawPhone.replace(/\D/g, "").slice(-10);
      const plan         = normalizePlan(getCol(row, colMap, "plan") || "monthly");
      const rawDate      = getCol(row, colMap, "start_date");
      const rawAmount    = getCol(row, colMap, "amount");
      const parsedAmount = parseInt(rawAmount.replace(/[^\d]/g, ""));
      const amount       = (!rawAmount || isNaN(parsedAmount) || parsedAmount === 0) ? "0" : String(parsedAmount);
      const payment_mode = normalizePaymentMode(getCol(row, colMap, "payment_mode") || "cash");
      const gender       = normalizeGender(getCol(row, colMap, "gender"));
      const age          = normalizeAge(getCol(row, colMap, "age"));
      const rawArea      = getCol(row, colMap, "area");
      const rawMemberNum = getCol(row, colMap, "member_number");
      const { number: member_number, original: legacy_member_id } = normalizeMemberNumber(rawMemberNum);

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
            start_date = `${c.length === 4 ? c : "20" + c}-${b.padStart(2, "0")}-${a.padStart(2, "0")}`;
          } else { start_date = format(new Date(), "yyyy-MM-dd"); }
        } else { start_date = rawDateTrimmed || format(new Date(), "yyyy-MM-dd"); }
      }

      let _error = "";
      if (!name) _error = "Missing name";
      else if (phone && phone.length !== 10) _error = "Invalid phone";
      parsed.push({ name, phone, plan, start_date, amount, payment_mode, gender, age, area: rawArea, member_number, legacy_member_id: legacy_member_id || undefined, _rowId: parsed.length, _status: !name ? "error" : "ok", _error });
    });

    setParseStage(4);
    const { rows: pipelineRows } = await runImportPipeline(parsed, {
      supabase,
      onStage: stage => { if (stage === "areas") setParseStage(4); if (stage === "ids") setParseStage(5); },
    });

    setRows(pipelineRows);
    setParseStage(5);
    setParsing(false);
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function handleProceedToEdit() {
    sessionStorage.setItem("import_rows", JSON.stringify(rows));
    sessionStorage.setItem("import_rows_original", JSON.stringify(rows.map(r => ({ ...r }))));
    sessionStorage.setItem("import_has_id_col", detectedColumns.member_number ? "1" : "0");
    const needsReview = rows.some(r => r.area && ((r._area_confidence ?? 1) < 0.90 || r._area_matched_by === "unresolved"));
    router.push(needsReview ? "/import/review" : "/import/edit");
  }

  function resetUpload() {
    setRows([]);
    setDetectedColumns({});
    setFileName("");
    setParseStage(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const validRows = rows.filter(r => r._status === "ok");
  const errorRows = rows.filter(r => r._status !== "ok");
  const areaRows  = rows.filter(r => r.area && (r._area_confidence ?? 1) < 0.90);
  const autoIdRows = validRows.filter(r => r._id_auto);

  // ── PARSING STATE ─────────────────────────────────────────────────────────
  if (parsing) {
    return (
      <div className="max-w-lg mx-auto mt-16 space-y-6">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
            <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
            <FileSpreadsheet className="absolute inset-0 m-auto w-8 h-8 text-brand-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Processing your file</h2>
          <p className="text-sm text-slate-400 mt-1">{fileName}</p>
        </div>

        <div className="card p-6 space-y-3">
          {STAGES.map(stage => {
            const done    = parseStage > stage.id;
            const active  = parseStage === stage.id;
            const pending = parseStage < stage.id;
            return (
              <div key={stage.id} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${active ? "bg-brand-50 border border-brand-200" : done ? "opacity-60" : "opacity-30"}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-sm ${done ? "bg-emerald-100" : active ? "bg-brand-100" : "bg-slate-100"}`}>
                  {done ? <Check className="w-4 h-4 text-emerald-600" /> : active ? <div className="w-3 h-3 rounded-full bg-brand-500 animate-pulse" /> : <span className="text-slate-400 text-xs">{stage.id}</span>}
                </div>
                <span className={`text-sm font-semibold ${active ? "text-brand-700" : done ? "text-slate-500" : "text-slate-400"}`}>
                  {stage.emoji} {stage.label}
                  {active && (stage as any).note && (
                    <span className="ml-2 text-xs font-normal text-brand-500 opacity-80">
                      ({(stage as any).note})
                    </span>
                  )}
                </span>
                {active && <div className="ml-auto flex gap-1">{[0,1,2].map(i => <div key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>}
              </div>
            );
          })}
        </div>

        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
          <div className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full animate-progress-bar" />
        </div>
      </div>
    );
  }

  // ── AFTER UPLOAD ──────────────────────────────────────────────────────────
  if (rows.length > 0) {
    return (
      <div className="max-w-5xl space-y-4 pb-6">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-3">
            <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
              <ArrowLeft className="w-4 h-4" />Members
            </Link>
            <span className="text-slate-300">/</span>
            <h1 className="text-xl font-bold text-slate-900">Import Members</h1>
          </div>
          <button onClick={resetUpload} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-50 transition-all">
            <RefreshCw className="w-3.5 h-3.5" />Upload different file
          </button>
        </div>

        {/* ── File banner ── */}
        <div className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-2xl px-4 py-3">
          <div className="w-9 h-9 bg-emerald-100 rounded-xl flex items-center justify-center flex-shrink-0">
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-emerald-800 truncate">{fileName}</p>
            <p className="text-xs text-emerald-600">{rows.length} rows detected</p>
          </div>
          <span className="text-xs font-bold bg-emerald-600 text-white px-2.5 py-1 rounded-full">Processed</span>
        </div>

        {/* ── Stats row ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Ready",          value: validRows.filter(r => !r._error).length, color: "text-emerald-600", bg: "bg-emerald-50", border: "border-emerald-200" },
            { label: "ID Auto-assigned", value: autoIdRows.length,                    color: "text-amber-600",   bg: "bg-amber-50",   border: "border-amber-200"   },
            { label: "Will be skipped",  value: errorRows.length,                     color: "text-red-600",     bg: "bg-red-50",     border: "border-red-200"     },
            { label: "Areas need review",value: areaRows.length,                      color: "text-orange-600",  bg: "bg-orange-50",  border: "border-orange-200"  },
          ].map(s => (
            <div key={s.label} className={`card p-4 text-center border ${s.border} ${s.bg}`}>
              <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
              <p className="text-xs text-slate-500 mt-0.5 leading-tight">{s.label}</p>
            </div>
          ))}
        </div>

        {/* ── Detected columns ── */}
        <div className="card p-3">
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(FIELD_LABELS).map(([field, label]) => (
              <div key={field} className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold border ${detectedColumns[field] ? "bg-emerald-50 text-emerald-700 border-emerald-200" : "bg-slate-50 text-slate-400 border-slate-200"}`}>
                {detectedColumns[field] ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* ── Preview table — fixed height, independently scrollable ── */}
        <div className="card">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50 rounded-t-2xl">
            <p className="text-sm font-bold text-slate-700">Preview — {rows.length} rows</p>
            <p className="text-xs text-slate-400">Scroll to see all</p>
          </div>
          {/* Scrollable container — data-lenis-prevent tells root Lenis to hand off wheel events here */}
          <div
            ref={tableScrollRef}
            data-lenis-prevent
            className="overflow-y-auto overflow-x-auto no-scrollbar rounded-b-2xl"
            style={{ maxHeight: 'min(380px, 55vh)', WebkitOverflowScrolling: 'touch' }}
          >
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-100 border-b border-slate-200">
                  {["", "#", "Name", "Phone", "Plan", "Age", "Area ✦", "Amount"].map(h => (
                    <th key={h} className="text-left px-4 py-2.5 text-xs font-bold text-slate-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row, i) => (
                  <tr key={i} className={row._status !== "ok" ? "bg-red-50/60" : row._error ? "bg-amber-50/60" : "hover:bg-slate-50"}>
                    <td className="px-4 py-2.5">
                      {row._status !== "ok" ? <AlertTriangle className="w-4 h-4 text-red-500" /> : row._error ? <AlertTriangle className="w-4 h-4 text-amber-500" /> : <Check className="w-4 h-4 text-emerald-500" />}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400 font-mono text-xs whitespace-nowrap">{row.member_number ? `GF${row.member_number.padStart(4, '0')}` : "—"}</td>
                    <td className="px-4 py-2.5">
                      <p className="font-medium text-slate-900 whitespace-nowrap">{row.name || <span className="text-slate-400">(no name)</span>}</p>
                      {row._error && <p className={`text-xs mt-0.5 ${row._status !== "ok" ? "text-red-500" : "text-amber-600"}`}>{row._error}</p>}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{row.phone || "—"}</td>
                    <td className="px-4 py-2.5 text-slate-500 capitalize whitespace-nowrap">{row.plan}</td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">{row.age || "—"}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1.5">
                        {row.area ? (
                          <>
                            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${(row._area_confidence ?? 0) >= 0.90 ? "bg-emerald-500" : (row._area_confidence ?? 0) >= 0.70 ? "bg-amber-400" : row._area_matched_by === "unresolved" ? "bg-red-400" : "bg-slate-300"}`} />
                            <span className="text-slate-500 text-xs whitespace-nowrap">{row.area}</span>
                          </>
                        ) : <span className="text-slate-300">—</span>}
                    </div>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 whitespace-nowrap">₹{row.amount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ── Continue button ── */}
        {validRows.length > 0 && (
          <button onClick={handleProceedToEdit} className="btn-primary group relative overflow-hidden">
            <span className="relative z-10 flex items-center justify-center gap-2">
              <Zap className="w-4 h-4" />
              {areaRows.length > 0 ? `Review ${areaRows.length} Areas & Continue →` : `Edit & Review ${validRows.length} Members →`}
            </span>
            <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
          </button>
        )}
      </div>
    );
  }

  // ── UPLOAD STATE (default) ────────────────────────────────────────────────
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/members" className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-900 transition-colors">
          <ArrowLeft className="w-4 h-4" />Members
        </Link>
        <span className="text-slate-300">/</span>
        <h1 className="text-xl font-bold text-slate-900">Import Members</h1>
      </div>

      {/* Mode selector */}
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4 border-2 border-brand-400 bg-brand-50/40">
          <div className="flex items-center gap-2 mb-1">
            <Upload className="w-4 h-4 text-brand-600" />
            <span className="text-sm font-bold text-brand-700">Auto Import</span>
            <span className="text-xs bg-brand-500 text-white px-2 py-0.5 rounded-full font-semibold">Active</span>
          </div>
          <p className="text-xs text-slate-500">Columns are auto-detected using smart fuzzy matching</p>
        </div>
        <Link href="/import/manual" className="card p-4 hover:border-slate-300 hover:bg-slate-50 transition-all">
          <div className="flex items-center gap-2 mb-1">
            <Shuffle className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-bold text-slate-700">Manual Mapping</span>
          </div>
          <p className="text-xs text-slate-500">Drag and drop to manually map columns to fields</p>
        </Link>
      </div>

      {/* Drop zone */}
      <label
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center gap-4 py-16 px-8 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${
          isDragging ? "border-brand-500 bg-brand-50 scale-[1.01]" : "border-slate-200 hover:border-brand-400 hover:bg-brand-50/30"
        }`}
      >
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all ${isDragging ? "bg-brand-100" : "bg-slate-100"}`}>
          <FileSpreadsheet className={`w-8 h-8 transition-colors ${isDragging ? "text-brand-600" : "text-slate-400"}`} />
        </div>
        <div className="text-center">
          <p className="text-lg font-bold text-slate-800">{isDragging ? "Drop it here!" : "Drop your file here"}</p>
          <p className="text-sm text-slate-400 mt-1">or <span className="text-brand-600 font-semibold">click to browse</span></p>
          <p className="text-xs text-slate-400 mt-2">CSV, XLS, XLSX — up to 10MB — up to 50,000 rows</p>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
      </label>

      {/* What we detect */}
      <div className="card p-5">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Fields we auto-detect</p>
        <div className="flex flex-wrap gap-2">
          {Object.entries(FIELD_LABELS).map(([, label]) => (
            <span key={label} className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-400" />
              {label}
            </span>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-3">Any header name works — we match using smart fuzzy detection with 40+ aliases per field.</p>
      </div>
    </div>
  );
}
