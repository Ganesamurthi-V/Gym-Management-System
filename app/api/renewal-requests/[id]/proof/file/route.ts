import { NextRequest, NextResponse } from 'next/server'
import { withAuth, apiError, isValidUUID } from '@/lib/api/withAuth'
import { createAdminClient } from '@/lib/supabase/admin'
import { detectProofType, proofPathBelongsToGym, PROOF_BUCKET, PROOF_EXTENSION } from '@/lib/renewal/proof'

export const dynamic = 'force-dynamic'

/**
 * GET /api/renewal-requests/[id]/proof/file  ->  the proof image or PDF itself.
 *
 * Authorization, in order: the caller is a signed-in gym owner (withAuth); the request is read through RLS and
 * with an explicit gym filter, so another gym's request id answers 404, the same as an id that does not exist;
 * the storage path comes from that row, never from the URL, and must sit in this gym's folder. The bytes are
 * then read with the service role (the bucket has no user policies) and sent back, so the browser never
 * receives a storage URL.
 */
export const GET = withAuth('RENEWAL_REQUEST_PROOF_FILE', async (req: NextRequest, { gym, supabase, log }) => {
  const id = req.nextUrl.pathname.split('/').at(-3) ?? ''
  if (!isValidUUID(id)) return apiError(400, 'NOT_FOUND', 'Invalid request id')

  const { data: request, error } = await supabase
    .from('member_renewal_requests')
    .select('proof_path')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (error) {
    log.error('Proof lookup failed', error)
    return apiError(500, 'SERVER_ERROR', 'Could not load the proof.')
  }
  if (!request || !proofPathBelongsToGym(request.proof_path, gym.id)) {
    return apiError(404, 'NOT_FOUND', 'Request not found')
  }

  const { data: blob, error: downloadError } = await createAdminClient().storage
    .from(PROOF_BUCKET)
    .download(request.proof_path)
  if (downloadError || !blob) {
    log.error('Proof download failed', downloadError)
    return apiError(404, 'NOT_FOUND', 'The proof file could not be found.')
  }

  const bytes = new Uint8Array(await blob.arrayBuffer())
  const type = detectProofType(bytes.subarray(0, 8))
  if (!type) {
    log.error('Proof file has an unexpected type', { id })
    return apiError(415, 'INVALID_FILE', 'The proof file is not a supported image or PDF.')
  }

  return new NextResponse(bytes, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.byteLength),
      'Content-Disposition': `inline; filename="payment-proof.${PROOF_EXTENSION[type]}"`,
      // Personal payment screenshots: never cached by the browser or a proxy, never sniffed, same-origin only.
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Cross-Origin-Resource-Policy': 'same-origin',
      // An image is shown with nothing allowed to run; a PDF needs the browser's own viewer.
      ...(type === 'application/pdf' ? {} : { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" }),
    },
  })
}, { rateLimit: 60 })
