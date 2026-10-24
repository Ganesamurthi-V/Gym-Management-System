import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'
import { reportAlertInBackground } from '@/lib/monitoring/alert'

export const dynamic = 'force-dynamic'

const planSchema = z.enum(['monthly', 'yearly', 'whatsapp_addon']).optional()

/**
 * POST /api/subscription/request
 *
 * Accepts a multipart/form-data payload with:
 *   - file: the payment proof (jpg/png/pdf, max 10 MB)
 *   - transaction_id: optional transaction reference string
 *   - notes: optional free-text notes
 *
 * Uploads the file to the `payment-proofs` Supabase Storage bucket,
 * then inserts a row into `subscription_requests`.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { allowed } = await checkRateLimit(user.id, 'POST /api/subscription/request', 5)
  if (!allowed) return NextResponse.json({ error: 'Too many requests. Please try again later.' }, { status: 429 })

  // Fetch the gym owned by this user
  const { data: gym } = await supabase
    .from('gyms')
    .select('id')
    .eq('owner_id', user.id)
    .single()

  if (!gym) return NextResponse.json({ error: 'Gym not found' }, { status: 404 })

  // Block if there is already a pending request
  const { data: existing } = await supabase
    .from('subscription_requests')
    .select('id')
    .eq('gym_id', gym.id)
    .eq('status', 'pending')
    .maybeSingle()

  if (existing) {
    return NextResponse.json(
      { error: 'A request is already pending review. Please wait for admin to process it.' },
      { status: 409 }
    )
  }

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data.' }, { status: 400 })
  }

  const file = formData.get('file') as File | null
  const rawTxn   = formData.get('transaction_id')
  const rawNotes = formData.get('notes')
  const transactionId = typeof rawTxn === 'string' && rawTxn ? rawTxn : null
  const notes         = typeof rawNotes === 'string' && rawNotes ? rawNotes : null

  if ((transactionId?.length ?? 0) > 100 || (notes?.length ?? 0) > 1000) {
    return NextResponse.json({ error: 'Transaction ID or notes too long.' }, { status: 400 })
  }

  // Optional so older clients keep working; when sent it must be a known plan.
  const rawPlan = formData.get('plan')
  const planParsed = planSchema.safeParse(rawPlan === null || rawPlan === '' ? undefined : rawPlan)
  if (!planParsed.success) {
    return NextResponse.json({ error: 'Invalid plan.' }, { status: 400 })
  }
  const planRequested = planParsed.data ?? null

  // The add-on is only for Free gyms. Decided from the database, never from the body.
  if (planRequested === 'whatsapp_addon') {
    const { data: gymPlan, error: gymPlanError } = await supabase
      .from('gyms')
      .select('plan_type')
      .eq('id', gym.id)
      .single()
    if (gymPlanError || !gymPlan) {
      logger.error('subscription_request_plan_lookup_failed', { error: gymPlanError?.message })
      return NextResponse.json({ error: 'Could not verify your plan. Please try again.' }, { status: 500 })
    }
    if (gymPlan.plan_type !== 'free') {
      return NextResponse.json(
        { error: 'The WhatsApp add-on is only available on the Free plan. WhatsApp is included in paid plans.' },
        { status: 403 }
      )
    }
  }

  // Validate file
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  const maxSize = 10 * 1024 * 1024 // 10 MB

  if (!file || !allowedTypes.includes(file.type) || file.size > maxSize) {
    return NextResponse.json(
      { error: 'Invalid file. Please upload a JPG, PNG or PDF under 10 MB.' },
      { status: 400 }
    )
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
    return NextResponse.json(
      { error: 'Invalid file. Please upload a JPG, PNG or PDF under 10 MB.' },
      { status: 400 }
    )
  }

  // Upload to Supabase Storage (private bucket `payment-proofs`)
  const fileName = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { data: upload, error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(fileName, file, { contentType: detectedType, upsert: false })

  if (uploadError || !upload) {
    logger.error('subscription_proof_upload_failed', { error: uploadError?.message })
    reportAlertInBackground({ key: 'sub:proof_upload_failed', severity: 'critical', title: 'Payment proof upload failed', body: `gymId=${gym.id} error=${String(uploadError ? uploadError.message : 'no upload result').slice(0, 300)}`, gymId: gym.id })
    return NextResponse.json({ error: 'Upload failed. Please try again.' }, { status: 500 })
  }

  // Insert subscription_request row (store path, not public URL — bucket is private)
  const { error: insertError } = await supabase
    .from('subscription_requests')
    .insert({
      gym_id: gym.id,
      uploaded_file_url: upload.path,
      transaction_id: transactionId,
      notes,
      plan_requested: planRequested,
    })

  if (insertError) {
    logger.error('subscription_request_insert_failed', { error: insertError.message })
    reportAlertInBackground({ key: 'sub:request_insert_failed', severity: 'critical', title: 'Subscription request insert failed', body: `gymId=${gym.id} error=${insertError.message.slice(0, 300)}`, gymId: gym.id })
    // The proof was uploaded but no row references it; remove it so files are not leaked (best effort).
    // Service role is required: payment-proofs only has INSERT/SELECT policies for users, so a
    // user-scoped remove() silently deletes nothing. Safe because the path is the object THIS request
    // just uploaded under the authenticated user's own prefix, never client-supplied (guarded below).
    if (!upload.path.startsWith(`${user.id}/`)) {
      logger.warn('subscription_proof_cleanup_skipped', { reason: 'path outside user prefix' })
    } else {
      const { data: removed, error: cleanupError } = await createAdminClient()
        .storage.from('payment-proofs').remove([upload.path])
      if (cleanupError) {
        logger.warn('subscription_proof_cleanup_failed', { error: cleanupError.message })
      } else if (!removed || removed.length === 0) {
        logger.warn('subscription_proof_cleanup_failed', { error: 'orphan not removed (no object returned)' })
      }
    }
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
