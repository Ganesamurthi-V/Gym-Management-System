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
  isRecognizedPlan,
} from "@/lib/import/normalizers";
import { runImportPipeline } from "@/lib/import/pipeline";
import { useLenisScroll } from "@/lib/hooks/useLenisScroll";
import { ArrowRight } from "lucide-react";
import WizardHeader from "@/components/import/WizardHeader";

export interface ImportedRow {
  name: string;
  phone: string;
  plan: string;
  category?: string;
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
  _rawPlan?: string;
  _original_area?: string;
}

const EXPECTED_COLUMNS = [
  { key: "name", label: "Name", required: true },
  { key: "phone", label: "Phone", required: true },
  { key: "member_number", label: "Member #", required: false },
  { key: "plan", label: "Plan", required: false },
  { key: "category", label: "Category", required: false },
  { key: "start_date", label: "Start Date", required: false },
  { key: "amount", label: "Amount", required: false },
  { key: "payment_mode", label: "Payment Mode", required: false },
  { key: "gender", label: "Gender", required: false },
  { key: "age", label: "Age", required: false },
  { key: "area", label: "Area", required: false },
];

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
    // Type
    "pricingplan", "pricing plan", "pricing_plan",
    // Indian gym exports
    "gymplan", "gym plan", "gym_plan",
    "gympackage", "gym package", "gym_package",
    "scheme", "schemename", "scheme name",
    "batch", "batchname", "batch name",
  ],

  category: [
    "category", "plancategory", "plan category", "plan_category",
    "membershipcategory", "membership category", "type"
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
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
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
  member_number: "Member #", name: "Name", phone: "Phone", plan: "Plan", category: "Category",
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
  const [detectedColumns, setDetectedColumns] = useState<Record<string, string>>({});
  const [parsing, setParsing] = useState(false);
  const [parseStage, setParseStage] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [unmappedPlans, setUnmappedPlans] = useState<string[]>([]);
  const [planMapping, setPlanMapping] = useState<Record<string, string>>({});
  const [tempImportState, setTempImportState] = useState<{
    parsedRows: ImportedRow[];
    detectedColumns: Record<string, string>;
    fileName: string;
  } | null>(null);

  // New states for column mapping
  const [showMapping, setShowMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState<string[]>([]);
  const [fileSamples, setFileSamples] = useState<Record<string, string>>({});
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({});
  const [tempFile, setTempFile] = useState<File | null>(null);

  const supabase = createClient();
  const router = useRouter();

  function proceedWithRows(pipelineRows: ImportedRow[], hasIdCol: boolean) {
    sessionStorage.setItem("import_rows", JSON.stringify(pipelineRows));
    sessionStorage.setItem("import_rows_original", JSON.stringify(pipelineRows.map(r => ({ ...r }))));
    sessionStorage.setItem("import_has_id_col", hasIdCol ? "1" : "0");
    const needsReview = pipelineRows.some(r => r.area && ((r._area_confidence ?? 1) < 0.90 || r._area_matched_by === "unresolved"));
    router.push(needsReview ? "/import/review" : "/import/edit");
  }

  async function applyPlanMappingAndProceed() {
    if (!tempImportState) return;
    setParsing(true);
    setParseStage(4);

    const mappedRows = tempImportState.parsedRows.map(r => {
      if (r._rawPlan && planMapping[r._rawPlan]) {
        return {
          ...r,
          plan: planMapping[r._rawPlan],
        };
      }
      return r;
    });

    const { rows: pipelineRows } = await runImportPipeline(mappedRows, {
      supabase,
      onStage: stage => { if (stage === "areas") setParseStage(4); if (stage === "ids") setParseStage(5); },
    });

    setUnmappedPlans([]);
    setTempImportState(null);
    setParsing(false);
    proceedWithRows(pipelineRows, !!tempImportState.detectedColumns.member_number);
  }

  async function processFile(file: File, userMapping?: Record<string, string>) {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert("File too large. Maximum size is 10MB."); return; }

    setFileName(file.name);
    if (!userMapping) {
      sessionStorage.removeItem("import_rows");
      sessionStorage.removeItem("import_rows_original");
      sessionStorage.removeItem("import_review_state");
      sessionStorage.removeItem("import_cluster");
      sessionStorage.removeItem("import_has_id_col");
    }

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

    let headerRowIndex = 1;
    let maxDetectedFields = 0;
    let bestHeaders: string[] = [];

    const scanLimit = Math.min(ws.rowCount, 50);
    for (let i = 1; i <= scanLimit; i++) {
      const row = ws.getRow(i);
      const rowHeaders: string[] = [];
      row.eachCell({ includeEmpty: true }, (cell: any) => rowHeaders.push(cellStr(cell.value)));

      let detectedCount = 0;
      rowHeaders.forEach(h => {
        if (detectField(h)) detectedCount++;
      });

      if (detectedCount > maxDetectedFields) {
        maxDetectedFields = detectedCount;
        headerRowIndex = i;
        bestHeaders = rowHeaders;
      }
    }

    if (maxDetectedFields < 2) {
      headerRowIndex = 1;
      bestHeaders = [];
      ws.getRow(1).eachCell({ includeEmpty: true }, (cell: any) => bestHeaders.push(cellStr(cell.value)));
    }

    const headers = bestHeaders;
    let colMap: Record<string, number> = {};
    const summaryMapping: Record<string, string> = {};

    if (userMapping) {
      for (const [header, field] of Object.entries(userMapping)) {
        if (field && field !== "ignore") {
          const idx = headers.indexOf(header);
          if (idx !== -1) colMap[field] = idx + 1;
          summaryMapping[field] = header;
        }
      }
      setDetectedColumns(summaryMapping);
    } else {
      colMap = buildColumnMap(headers);

      // Get samples from the row after the header
      const sampleRow = ws.getRow(headerRowIndex + 1);
      const samples: Record<string, string> = {};
      headers.forEach((h, i) => {
        samples[h] = cellStr(sampleRow.getCell(i + 1).value);
      });
      setFileSamples(samples);

      // Create initial mapping { fileHeader: dbField }
      const initialMapping: Record<string, string> = {};
      for (const [field, idx] of Object.entries(colMap)) {
        const header = headers[idx - 1];
        if (header) initialMapping[header] = field;
      }

      setColumnMapping(initialMapping);
      setFileHeaders(headers);
      setTempFile(file);
      setShowMapping(true);
      setParsing(false);
      return;
    }

    setParseStage(3);

    const parsed: ImportedRow[] = [];
    const unrecognizedSet = new Set<string>();
    ws.eachRow({ includeEmpty: false }, (row: any, rowIndex: number) => {
      if (rowIndex <= headerRowIndex) return;
      const name = getCol(row, colMap, "name");
      const rawPhone = getCol(row, colMap, "phone");
      const phone = rawPhone.replace(/\D/g, "").slice(-10);
      const rawPlan = getCol(row, colMap, "plan");
      const plan = normalizePlan(rawPlan || "monthly");
      const rawCategory = getCol(row, colMap, "category");
      let category = rawCategory.toLowerCase().trim();
      if (!['strength', 'cardio', 'both'].includes(category)) category = 'both';
      const rawDate = getCol(row, colMap, "start_date");
      const rawAmount = getCol(row, colMap, "amount");
      const parsedAmount = parseInt(rawAmount.replace(/[^\d]/g, ""));
      const amount = (!rawAmount || isNaN(parsedAmount) || parsedAmount === 0) ? "0" : String(parsedAmount);
      const payment_mode = normalizePaymentMode(getCol(row, colMap, "payment_mode") || "cash");
      const gender = normalizeGender(getCol(row, colMap, "gender"));
      const age = normalizeAge(getCol(row, colMap, "age"));
      const rawArea = getCol(row, colMap, "area");
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

      if (rawPlan && !isRecognizedPlan(rawPlan)) {
        unrecognizedSet.add(rawPlan.trim());
      }

      parsed.push({
        name,
        phone,
        plan,
        category,
        _rawPlan: rawPlan ? rawPlan.trim() : undefined,
        start_date,
        amount,
        payment_mode,
        gender,
        age,
        area: rawArea,
        member_number,
        legacy_member_id: legacy_member_id || undefined,
        _rowId: parsed.length,
        _status: !name ? "error" : "ok",
        _error
      });
    });

    const unrecognizedList = Array.from(unrecognizedSet).filter(Boolean);
    if (unrecognizedList.length > 0) {
      setUnmappedPlans(unrecognizedList);
      const initialMapping: Record<string, string> = {};
      unrecognizedList.forEach(p => {
        initialMapping[p] = "monthly";
      });
      setPlanMapping(initialMapping);
      setTempImportState({
        parsedRows: parsed,
        detectedColumns: summaryMapping,
        fileName: file.name,
      });
      setParsing(false);
      return;
    }

    setParseStage(4);
    const { rows: pipelineRows } = await runImportPipeline(parsed, {
      supabase,
      onStage: stage => { if (stage === "areas") setParseStage(4); if (stage === "ids") setParseStage(5); },
    });

    setParsing(false);
    proceedWithRows(pipelineRows, !!summaryMapping.member_number);
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

  function resetUpload() {
    setDetectedColumns({});
    setFileName("");
    setParseStage(0);
    setUnmappedPlans([]);
    setPlanMapping({});
    setTempImportState(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  // ── PARSING STATE ─────────────────────────────────────────────────────────
  if (parsing) {
    return (
      <div className="max-w-2xl mx-auto mt-12 space-y-6">
        <div className="card p-8 border border-slate-100 bg-white shadow-xl rounded-3xl space-y-6">
          <div className="text-center">
            <div className="relative w-20 h-20 mx-auto mb-4">
              <div className="absolute inset-0 rounded-full border-4 border-brand-100" />
              <div className="absolute inset-0 rounded-full border-4 border-brand-500 border-t-transparent animate-spin" />
              <FileSpreadsheet className="absolute inset-0 m-auto w-8 h-8 text-brand-500" />
            </div>
            <h2 className="text-xl font-bold text-slate-900">Processing your file</h2>
            <p className="text-sm text-slate-400 mt-1">{fileName}</p>
          </div>

          <div className="space-y-3">
            {STAGES.map(stage => {
              const done = parseStage > stage.id;
              const active = parseStage === stage.id;
              const pending = parseStage < stage.id;
              return (
                <div key={stage.id} className={`flex items-center gap-4 p-3.5 rounded-xl transition-all ${active ? "bg-brand-50 border border-brand-200" : done ? "opacity-60" : "opacity-30"}`}>
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
                  {active && <div className="ml-auto flex gap-1">{[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 bg-brand-400 rounded-full animate-bounce-dot" style={{ animationDelay: `${i * 0.2}s` }} />)}</div>}
                </div>
              );
            })}
          </div>

          <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-brand-400 to-brand-600 rounded-full transition-all duration-700 ease-out" 
              style={{ width: `${Math.max(15, (parseStage / STAGES.length) * 100)}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── COLUMN MAPPING ────────────────────────────────────────────────────────
  if (showMapping && tempFile) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <WizardHeader currentStep={2} />

        <Link href="/members" className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </Link>

        <div className="text-center bg-white border border-slate-100 rounded-2xl p-6 shadow-sm">
          <div className="w-16 h-16 bg-brand-50 border border-brand-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Shuffle className="w-8 h-8 text-brand-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Map Columns</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
            We've auto-detected columns from your sheet. Review the mappings below and configure any unmatched columns before proceeding.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {fileHeaders.map((header) => {
            const sample = fileSamples[header];
            const mappedField = columnMapping[header];
            const isMapped = mappedField && mappedField !== "ignore";

            return (
              <div key={header} className={`flex items-center justify-between gap-4 p-4 border rounded-2xl transition-all bg-white shadow-xs ${isMapped ? "border-brand-200 bg-brand-50/10" : "border-slate-200 bg-slate-50/40"}`}>
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-sm font-bold text-slate-800 truncate">
                    {header}
                  </span>
                  {sample && (
                    <span className="text-xs text-slate-400 truncate font-mono">
                      Sample: {sample}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className="text-slate-400 font-bold hidden sm:inline">→</span>
                  <select
                    value={columnMapping[header] || ""}
                    onChange={(e) => setColumnMapping({ ...columnMapping, [header]: e.target.value })}
                    className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-slate-700 font-bold min-w-[160px]"
                  >
                    <option value="">Don't import this field</option>
                    <optgroup label="Required Fields">
                      {EXPECTED_COLUMNS.filter(c => c.required).map(col => {
                        const alreadyMapped = Object.entries(columnMapping).some(([h, f]) => f === col.key && h !== header);
                        return (
                          <option key={col.key} value={col.key} disabled={alreadyMapped}>
                            {col.label} * {alreadyMapped ? "(already mapped)" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                    <optgroup label="Optional Fields">
                      {EXPECTED_COLUMNS.filter(c => !c.required).map(col => {
                        const alreadyMapped = Object.entries(columnMapping).some(([h, f]) => f === col.key && h !== header);
                        return (
                          <option key={col.key} value={col.key} disabled={alreadyMapped}>
                            {col.label} {alreadyMapped ? "(already mapped)" : ""}
                          </option>
                        );
                      })}
                    </optgroup>
                  </select>
                </div>
              </div>
            );
          })}
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
          <button
            onClick={() => {
              const mappedDbFields = Object.values(columnMapping);
              const missingRequired = EXPECTED_COLUMNS.filter(c => c.required && !mappedDbFields.includes(c.key));

              if (missingRequired.length > 0) {
                alert(`Please map all required fields: ${missingRequired.map(c => c.label).join(", ")}`);
                return;
              }

              setShowMapping(false);
              processFile(tempFile, columnMapping);
            }}
            className="btn-primary flex items-center justify-center gap-2 group relative overflow-hidden w-full py-3"
          >
            <span className="relative z-10 flex items-center gap-2 font-bold text-sm">
              Process File & Start Imports <ArrowRight className="w-4 h-4" />
            </span>
            <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
          </button>
        </div>
      </div>
    );
  }

  // ── UNMAPPED PLANS MAPPING ────────────────────────────────────────────────
  if (unmappedPlans.length > 0) {
    return (
      <section className="max-w-7xl mx-auto space-y-6">
        <WizardHeader currentStep={3} />
        <Link href="/members" className="flex items-center gap-1.5 text-sm font-bold text-slate-400 hover:text-slate-700 transition-colors w-fit">
          <ArrowLeft className="w-4 h-4" /> Back to Members
        </Link>
        <div className="text-center bg-white/30 backdrop-blur-lg border border-slate-200 rounded-2xl p-6 shadow-xl">
          <div className="w-16 h-16 bg-royal-50 border border-royal-200 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <Shuffle className="w-8 h-8 text-royal-500" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Map Unrecognized Memberships</h2>
          <p className="text-sm text-slate-500 mt-1 max-w-lg mx-auto">
            We detected plans in your Excel file that don't match our database plans. Map them to correct durations below.
          </p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {unmappedPlans.map((rawPlan) => (
            <div key={rawPlan} className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm">
              <span className="text-sm font-bold text-slate-700 bg-slate-50 border border-slate-200 px-3.5 py-2 rounded-xl shadow-inner truncate max-w-[200px]">
                {rawPlan}
              </span>
              <div className="flex items-center gap-2">
                <span className="text-slate-400 font-bold hidden sm:inline">→</span>
                <select
                  value={planMapping[rawPlan] || "monthly"}
                  onChange={(e) => setPlanMapping({ ...planMapping, [rawPlan]: e.target.value })}
                  className="px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-500 bg-white text-slate-700 font-bold min-w-[180px]"
                >
                  <option value="monthly">Monthly (1 Month)</option>
                  <option value="quarterly">Quarterly (3 Months)</option>
                  <option value="annual">Annual (1 Year)</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        <div className="bg-white border border-slate-100 p-4 rounded-2xl shadow-xs">
          <button
            onClick={applyPlanMappingAndProceed}
            className="btn-primary flex items-center justify-center gap-2 group relative overflow-hidden w-full py-3"
          >
            <span className="relative z-10 flex items-center gap-2 font-bold text-sm">
              Confirm & Proceed <ArrowRight className="w-4 h-4" />
            </span>
            <span className="absolute inset-0 bg-white/10 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-500 skew-x-12" />
          </button>
        </div>
      </section>
    );
  }

  // ── UPLOAD STATE (default) ────────────────────────────────────────────────
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Wizard Header */}
      <WizardHeader currentStep={1} />

      {/* Back link */}
      <Link href="/members" className="flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-800 transition-colors w-fit">
        <ArrowLeft className="w-4 h-4" /> Back to Members
      </Link>

      {/* Info Banner Container mirroring image */}
      <div className="bg-brand-50/40 border border-brand-100/80 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2.5 text-brand-800">
          <Upload className="w-5 h-5" />
          <h3 className="text-sm font-extrabold tracking-tight">Upload Your Members File</h3>
        </div>
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
          We support CSV and Excel files. Your data is processed securely and never leaves your browser until you confirm the import.
        </p>
        <div className="pt-2 border-t border-brand-100/50">
          <p className="text-xs font-bold text-brand-900 mb-2">Your file should include:</p>
          <ul className="space-y-1.5 text-xs text-slate-600 font-semibold">
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              <span><strong className="text-brand-700">Required:</strong> Name, Phone, Plan Name, Start Date</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              <span><strong className="text-slate-700">Optional:</strong> Email, DOB, Gender, Address, Emergency Contact, Fees, etc.</span>
            </li>
            <li className="flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-brand-500 rounded-full" />
              <span><strong className="text-slate-700">Format:</strong> First row should contain column headers</span>
            </li>
          </ul>
        </div>
      </div>

      {/* Drag & Drop Upload Zone */}
      <label
        onDragOver={e => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`flex flex-col items-center justify-center gap-6 py-20 px-8 border-2 border-dashed rounded-3xl cursor-pointer transition-all bg-white min-h-[380px] shadow-sm ${
          isDragging ? "border-brand-500 bg-brand-50/30 scale-[1.01] shadow-lg shadow-brand-500/5" : "border-slate-200 hover:border-brand-400 hover:bg-brand-50/5"
        }`}
      >
        <div className={`w-16 h-16 rounded-full flex items-center justify-center transition-all shadow-md ${isDragging ? "bg-brand-100 text-brand-600 shadow-brand-200 animate-pulse" : "bg-brand-500 text-white shadow-brand-500/20 shadow-lg"}`}>
          <Upload className="w-6 h-6" />
        </div>
        <div className="text-center space-y-1.5">
          <p className="text-lg font-extrabold text-slate-800 tracking-tight">{isDragging ? "Drop the file here!" : "Drag & Drop your file here"}</p>
          <p className="text-xs text-slate-400 font-semibold">or <span className="text-brand-600 font-bold hover:underline">click to browse computer</span></p>
        </div>
        <div className="border-t border-slate-100 pt-4 w-full max-w-xs text-center">
          <p className="text-[11px] text-slate-400 font-semibold">Supports CSV, XLS, XLSX formats &bull; Up to 10MB</p>
        </div>
        <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" onChange={handleFile} className="hidden" />
      </label>
    </div>
  );
}
