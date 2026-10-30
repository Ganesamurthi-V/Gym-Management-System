/**
 * Helpers for serving a member's payment proof to the gym owner.
 *
 * The proof lives in the private `member_payment_proofs` bucket under `<gym_id>/<member_id>/<file>`.
 * The owner never gets a storage link: the file route streams the bytes after checking that the request
 * belongs to the owner's gym, so there is no URL to edit and nothing to guess.
 */

export const PROOF_BUCKET = 'member_payment_proofs'

export type ProofType = 'image/jpeg' | 'image/png' | 'application/pdf'

/** The real type from the file's first bytes. The stored name and any browser-reported type are not trusted. */
export function detectProofType(head: Uint8Array): ProofType | null {
  const startsWith = (sig: number[]) => sig.every((b, i) => head[i] === b)
  if (startsWith([0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'image/png'
  if (startsWith([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf'
  return null
}

/** True only for a path inside this gym's own folder, with no way to climb out of it. */
export function proofPathBelongsToGym(path: string, gymId: string): boolean {
  if (!gymId || !path.startsWith(`${gymId}/`)) return false
  if (path.includes('..') || path.includes(String.fromCharCode(92)) || path.includes('//')) return false
  return path.length > gymId.length + 1 && path.length <= 300
}

export const PROOF_EXTENSION: Record<ProofType, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'application/pdf': 'pdf',
}
