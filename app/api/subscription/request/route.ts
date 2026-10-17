import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/rateLimit'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

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
    })

  if (insertError) {
    logger.error('subscription_request_insert_failed', { error: insertError.message })
    return NextResponse.json({ error: 'Could not save your request. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
