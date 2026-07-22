import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
  const transactionId = (formData.get('transaction_id') as string | null) || null
  const notes         = (formData.get('notes') as string | null) || null

  // Validate file
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  const maxSize = 10 * 1024 * 1024 // 10 MB

  if (!file || !allowedTypes.includes(file.type) || file.size > maxSize) {
    return NextResponse.json(
      { error: 'Invalid file. Please upload a JPG, PNG or PDF under 10 MB.' },
      { status: 400 }
    )
  }

  // Upload to Supabase Storage (private bucket `payment-proofs`)
  const fileName = `${user.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
  const { data: upload, error: uploadError } = await supabase.storage
    .from('payment-proofs')
    .upload(fileName, file, { contentType: file.type, upsert: false })

  if (uploadError || !upload) {
    return NextResponse.json({ error: uploadError?.message ?? 'Upload failed.' }, { status: 500 })
  }

  // Insert subscription_request row (store path, not public URL — bucket is private)
  const { data: insertedRow, error: insertError } = await supabase
    .from('subscription_requests')
    .insert({
      gym_id: gym.id,
      uploaded_file_url: upload.path,
      transaction_id: transactionId,
      notes,
    })
    .select('id')
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // Broadcast to admin channel so the admin subscription list updates in real-time
  // This is a belt-and-suspenders approach alongside postgres_changes —
  // broadcast is instant even if RLS on the admin side would block postgres_changes.
  try {
    await supabase.channel('admin_subscription_requests_realtime').send({
      type: 'broadcast',
      event: 'new_subscription_request',
      payload: {
        id: insertedRow?.id,
        gym_id: gym.id,
        timestamp: new Date().toISOString(),
      },
    })
  } catch {
    // Non-critical — postgres_changes will still fire
  }

  return NextResponse.json({ success: true })
}
