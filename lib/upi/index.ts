/**
 * lib/upi/index.ts
 *
 * UPI utilities barrel export.
 * Provides: parseUPIQRCode, generateUPILink, generateQRCode
 */

export { parseUPIQRCode } from './parse'
export type { UPIParsedData, UPIParseResult } from './parse'

export { generateUPILink, generateQRCode } from './generate'
export type { GenerateUPILinkParams } from './generate'
