/**
 * lib/upi/parse.ts
 *
 * Parses UPI payment URIs extracted from QR codes.
 *
 * Supports QR codes from ALL UPI apps (Google Pay, PhonePe, Paytm, BHIM,
 * Amazon Pay, Cred, SBI, ICICI, HDFC, Axis, any bank-generated UPI QR).
 * Never depends on a fixed QR format — uses standard URLSearchParams parsing.
 *
 * UPI URI format: upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=<currency>&tn=<note>
 */

export interface UPIParsedData {
  /** Payee VPA / UPI ID (pa parameter) */
  upiId: string
  /** Payee/Merchant name (pn parameter) */
  merchantName: string
  /** Merchant category code (mc parameter, optional) */
  merchantCode: string | null
  /** Currency (cu parameter, defaults to INR) */
  currency: string
  /** Pre-filled amount if present in the QR (am parameter, optional) */
  amount: number | null
  /** Transaction note (tn parameter, optional) */
  transactionNote: string | null
  /** Raw parsed parameters for future compatibility */
  rawParams: Record<string, string>
}

export type UPIParseResult =
  | { success: true; data: UPIParsedData }
  | { success: false; error: string }

/**
 * Parse a UPI URI string (from a decoded QR code) into structured merchant data.
 *
 * Handles all known UPI URI formats:
 *   upi://pay?pa=...&pn=...
 *   upi://pay?...  (any parameter order)
 *
 * Unknown parameters are preserved in rawParams without breaking parsing.
 *
 * @param upiUri - The decoded string from a UPI QR code
 */
export function parseUPIQRCode(upiUri: string): UPIParseResult {
  if (!upiUri || typeof upiUri !== 'string') {
    return { success: false, error: 'Empty or invalid input' }
  }

  const trimmed = upiUri.trim()

  // Normalize: some QRs use uppercase scheme or have extra whitespace
  const normalized = trimmed.replace(/^UPI:\/\//i, 'upi://')

  // Must start with upi://pay
  if (!normalized.toLowerCase().startsWith('upi://pay')) {
    return { success: false, error: 'Not a valid UPI payment URI. Expected format: upi://pay?pa=...' }
  }

  // Extract query string
  const queryStart = normalized.indexOf('?')
  if (queryStart === -1) {
    return { success: false, error: 'UPI URI has no parameters' }
  }

  const queryString = normalized.substring(queryStart + 1)
  let params: URLSearchParams

  try {
    params = new URLSearchParams(queryString)
  } catch {
    return { success: false, error: 'Failed to parse UPI URI parameters' }
  }

  // Extract the payee address (pa) — this is the only required field
  const pa = params.get('pa')?.trim()
  if (!pa) {
    return { success: false, error: 'UPI ID (pa) not found in the QR code' }
  }

  // Basic UPI ID format validation (must contain @)
  if (!pa.includes('@')) {
    return { success: false, error: `Invalid UPI ID format: "${pa}". Must contain @` }
  }

  // Extract all known parameters
  const pn = params.get('pn')?.trim() || ''
  const mc = params.get('mc')?.trim() || null
  const cu = params.get('cu')?.trim() || 'INR'
  const am = params.get('am')?.trim()
  const tn = params.get('tn')?.trim() || null

  // Parse amount if present
  let amount: number | null = null
  if (am) {
    const parsed = parseFloat(am)
    if (!isNaN(parsed) && parsed >= 0) {
      amount = parsed
    }
  }

  // Collect ALL raw params for future compatibility
  const rawParams: Record<string, string> = {}
  params.forEach((value, key) => {
    rawParams[key] = value
  })

  return {
    success: true,
    data: {
      upiId: pa,
      merchantName: pn,
      merchantCode: mc,
      currency: cu.toUpperCase(),
      amount,
      transactionNote: tn,
      rawParams,
    },
  }
}
