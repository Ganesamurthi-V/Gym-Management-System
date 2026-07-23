/**
 * lib/upi/generate.ts
 *
 * Generates UPI payment URIs and QR codes for collecting payments.
 *
 * Always generates a FRESH payment URI for every transaction using stored
 * merchant information and the current transaction amount. Never reuses
 * the uploaded QR string.
 */

export interface GenerateUPILinkParams {
  /** Merchant UPI ID (pa) */
  upiId: string
  /** Merchant display name (pn) */
  merchantName: string
  /** Payment amount in INR */
  amount: number
  /** Transaction note (tn) — defaults to "GymFlow Membership" */
  transactionNote?: string
  /** Currency (cu) — defaults to INR */
  currency?: string
  /** Merchant category code (mc, optional) */
  merchantCode?: string | null
  /** Transaction reference ID for future verification (tr, optional) */
  transactionRef?: string
}

/**
 * Generate a UPI payment URI from merchant details and transaction info.
 *
 * This creates a fresh URI for each transaction — never reuses the original
 * QR string. The generated URI is compatible with all UPI apps.
 *
 * @returns A complete upi://pay?... URI string
 */
export function generateUPILink(params: GenerateUPILinkParams): string {
  const {
    upiId,
    merchantName,
    amount,
    transactionNote = 'GymFlow Membership',
    currency = 'INR',
    merchantCode,
    transactionRef,
  } = params

  if (!upiId || !upiId.includes('@')) {
    throw new Error('Invalid UPI ID: must contain @')
  }
  if (amount <= 0) {
    throw new Error('Amount must be greater than 0')
  }

  const searchParams = new URLSearchParams()
  searchParams.set('pa', upiId)
  searchParams.set('pn', merchantName)
  searchParams.set('am', amount.toFixed(2))
  searchParams.set('cu', currency)
  searchParams.set('tn', transactionNote)

  if (merchantCode) {
    searchParams.set('mc', merchantCode)
  }
  if (transactionRef) {
    searchParams.set('tr', transactionRef)
  }

  return `upi://pay?${searchParams.toString()}`
}

/**
 * Generate a QR code data URL (PNG base64) from a UPI payment URI.
 *
 * Uses the 'qrcode' package which renders to a data URL suitable for
 * displaying in an <img> tag or downloading.
 *
 * @param upiUri - The UPI payment URI (output of generateUPILink)
 * @param size - Width/height in pixels (default: 280)
 * @returns Promise resolving to a data:image/png;base64,... string
 */
export async function generateQRCode(upiUri: string, size = 280): Promise<string> {
  // Dynamic import so the QR library is only loaded when needed (keeps bundle slim)
  const QRCode = (await import('qrcode')).default
  const dataUrl = await QRCode.toDataURL(upiUri, {
    width: size,
    margin: 2,
    color: {
      dark: '#000000',
      light: '#FFFFFF',
    },
    errorCorrectionLevel: 'M',
  })
  return dataUrl
}
