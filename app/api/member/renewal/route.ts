import { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { passesCsrfCheck, apiError, apiSuccess } from '@/lib/api/withAuth'
import { getMemberAccessState } from '@/lib/member/member-data'
import { memberRenewalSchema, memberDueSchema, paymentKindSchema } from '@/lib/renewal/validate'

export const dynamic = 'force-dynamic'

const BUCKET = 'member_payment_proofs'
const MAX_SIZE = 10 * 1024 * 1024
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'application/pdf']

/** Messages raised by create_member_renewal_request, mapped to the codes in RenewalErrorCode. */
const RPC_ERRORS: Record<string, { status: number; code: string; message: string }> = {
  ALREADY_PENDING: { status: 409, code: 'ALREADY_PENDING', message: 'You already have a payment waiting for review.' },
  INVALID_PLAN: { status: 400, code: 'INVALID_PLAN', message: 'That plan is not available. Please choose again.' },
  NO_PLANS: { status: 409, code: 'NO_PLANS', message: 'Your gym has not set up any plans yet.' },
  NO_UPI: { status: 409, code: 'NO_UPI', message: 'Your gym has not set up UPI payments yet.' },
  NOTHING_DUE: { status: 409, code: 'NOTHING_DUE', message: 'You have no pending dues to pay.' },
  INVALID_AMOUNT: { status: 400, code: 'INVALID_AMOUNT', message: 'Enter an amount between 1 and your pending dues.' },
  NOT_MEMBER: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
  MEMBER_APP_BLOCKED: { status: 403, code: 'FORBIDDEN', message: 'Forbidden' },
}

/**
 * POST /api/member/renewal  (multipart/form-data)
 *   kind? ('renewal' default | 'due'), file (jpg/png/pdf <= 10 MB), transaction_id?, notes?
 *   renewal: plan_key        due: amount (whole rupees, 1..pending dues; the database re-checks it)
 *
 * Not wrapped in withAuth: members own no gym. The plan, price and gym all come from the database
 * (the create functions re-read them); nothing but the plan key / due amount is trusted from the client.
 */
export async function POST(req: NextRequest) {
  if (!passesCsrfCheck(req)) return apiError(403, 'FORBIDDEN', 'Forbidden')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return apiError(401, 'FORBIDDEN', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, 'POST /api/member/renewal', 5)
  if (!allowed) return apiError(429, 'RATE_LIMITED', 'Too many requests. Please try again later.')

  // Same plan gate as the member pages; also resolves the member row through RLS.
  const access = await getMemberAccessState()
  if (access.state !== 'ok') return apiError(403, 'FORBIDDEN', 'Forbidden')
  const { member } = access.data

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return apiError(400, 'INVALID_FILE', 'Invalid form data.')
  }

  const kindParsed = paymentKindSchema.safeParse(formData.get('kind') ?? undefined)
  if (!kindParsed.success) return apiError(400, 'INVALID_FILE', 'Invalid request.')
  const kind = kindParsed.data

  const text = {
    transaction_id: formData.get('transaction_id') ?? undefined,
    notes: formData.get('notes') ?? undefined,
  }
  // What the create function is called with; built per kind, everything else is shared below.
  let rpcName: 'create_member_renewal_request' | 'create_member_due_payment_request'
  let rpcArgs: Record<string, unknown>
  if (kind === 'due') {
    const parsed = memberDueSchema.safeParse({ amount: formData.get('amount'), ...text })
    if (!parsed.success) {
      const amountBad = parsed.error.issues.some((i) => i.path[0] === 'amount')
      return amountBad
        ? apiError(400, 'INVALID_AMOUNT', RPC_ERRORS.INVALID_AMOUNT.message)
        : apiError(400, 'INVALID_FILE', 'Transaction ID or notes are too long.')
    }
    rpcName = 'create_member_due_payment_request'
    rpcArgs = { p_amount: parsed.data.amount, p_transaction_id: parsed.data.transaction_id ?? null, p_notes: parsed.data.notes ?? null }
  } else {
    const parsed = memberRenewalSchema.safeParse({ plan_key: formData.get('plan_key'), ...text })
    if (!parsed.success) {
      const planBad = parsed.error.issues.some((i) => i.path[0] === 'plan_key')
      return planBad
        ? apiError(400, 'INVALID_PLAN', 'Choose a plan before submitting your payment.')
        : apiError(400, 'INVALID_FILE', 'Transaction ID or notes are too long.')
    }
    rpcName = 'create_member_renewal_request'
    rpcArgs = { p_plan_key: parsed.data.plan_key, p_transaction_id: parsed.data.transaction_id ?? null, p_notes: parsed.data.notes ?? null }
  }

  const file = formData.get('file')
  if (!(file instanceof File) || !ALLOWED_TYPES.includes(file.type) || file.size === 0 || file.size > MAX_SIZE) {
    return apiError(400, 'INVALID_FILE', 'Invalid file. Please upload a JPG, PNG or PDF under 10 MB.')
  }

  // file.type is browser-reported and spoofable; the real type is whatever the bytes say.
  const head = new Uint8Array(await file.slice(0, 5).arrayBuffer())
  const startsWith = (sig: number[]) => sig.every((b, i) => head[i] === b)
  const detectedType =
    startsWith([0xff, 0xd8, 0xff]) ? 'image/jpeg'
    : startsWith([0x89, 0x50, 0x4e, 0x47]) ? 'image/png'
    : startsWith([0x25, 0x50, 0x44, 0x46, 0x2d]) ? 'application/pdf'
    : null
  if (!detectedType) {
    return apiError(400, 'INVALID_FILE', 'Invalid file. Please upload a JPG, PNG or PDF under 10 MB.')
  }

  // Cheap early exit so a second request does not upload a file just to be refused.
  const { data: pending, error: pendingError } = await supabase
    .from('member_renewal_requests')
    .select('id')
    .eq('status', 'pending')
    .eq('request_type', kind)
    .limit(1)
    .maybeSingle()
  if (pendingError) {
    logger.error('member_renewal_pending_check_failed', { error: pendingError.message })
    return apiError(500, 'SERVER_ERROR', 'Could not save your request. Please try again.')
  }
  if (pending) return apiError(409, 'ALREADY_PENDING', RPC_ERRORS.ALREADY_PENDING.message)

  // Server-built path: <gym_id>/<member_id>/<timestamp>-<safe name>. Never client-supplied.
  const prefix = `${member.gym_id}/${member.id}/`
  // Extension from the detected type, so the name never disagrees with the bytes (the owner route reads it for isPdf).
  const ext = detectedType === 'application/pdf' ? 'pdf' : detectedType === 'image/png' ? 'png' : 'jpg'
  const base = file.name.replace(/\.[^.]*$/, '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60) || 'proof'
  const path = `${prefix}${Date.now()}-${base}.${ext}`

  const admin = createAdminClient()
  const { error: uploadError } = await admin.storage
    .from(BUCKET)
    .upload(path, file, { contentType: detectedType, upsert: false })
  if (uploadError) {
    logger.error('member_renewal_upload_failed', { error: uploadError.message })
    return apiError(500, 'SERVER_ERROR', 'Upload failed. Please try again.')
  }

  const removeOrphan = async () => {
    if (!path.startsWith(prefix)) return
    const { error } = await admin.storage.from(BUCKET).remove([path])
    if (error) logger.warn('member_renewal_cleanup_failed', { error: error.message })
  }

  try {
    const { data: id, error } = await supabase.rpc(rpcName, { ...rpcArgs, p_proof_path: path } as never)
    if (error || !id) {
      await removeOrphan()
      const known = RPC_ERRORS[error?.message ?? '']
      if (known) return apiError(known.status, known.code, known.message)
      logger.error('member_renewal_create_failed', { error: error?.message })
      return apiError(500, 'SERVER_ERROR', 'Could not save your request. Please try again.')
    }
    return apiSuccess({ id }, 201)
  } catch (err) {
    await removeOrphan()
    logger.error('member_renewal_unexpected', { error: err instanceof Error ? err.message : String(err) })
    return apiError(500, 'SERVER_ERROR', 'Could not save your request. Please try again.')
  }
}
