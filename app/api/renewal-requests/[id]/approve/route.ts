import { NextRequest } from 'next/server'
import type { DueApproveResult } from '@/types/renewal'
import { withAuth, apiError, apiSuccess, isValidUUID } from '@/lib/api/withAuth'
import { deleteCache } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { todayIST } from '@/lib/utils'
import { isIsoDate } from '@/app/api/_guard'
import { sendRenewalMessage, cancelReminderCycles } from '@/lib/whatsapp/automation'
import { renewalStartDate, renewalEndDate } from '@/lib/renewal/dates'
import { approveRenewalSchema, isStartDateInWindow } from '@/lib/renewal/validate'

export const dynamic = 'force-dynamic'

/**
 * POST /api/renewal-requests/[id]/approve   body: { start_date?: 'YYYY-MM-DD' }
 * The plan, amount and member come from the request row inside approve_member_renewal_request.
 */
export const POST = withAuth('RENEWAL_REQUEST_APPROVE', async (req: NextRequest, { gym, supabase, log }) => {
  const id = req.nextUrl.pathname.split('/').at(-2) ?? ''
  if (!isValidUUID(id)) return apiError(400, 'NOT_FOUND', 'Invalid request id')

  let body: unknown = {}
  try { body = await req.json() } catch { /* empty body is fine */ }
  const parsed = approveRenewalSchema.safeParse(body ?? {})
  if (!parsed.success || (parsed.data.start_date && !isIsoDate(parsed.data.start_date))) {
    return apiError(400, 'BAD_REQUEST', 'start_date must be a valid YYYY-MM-DD date')
  }

  // Read through RLS: only this owner's gym rows are visible.
  const { data: request, error: readError } = await supabase
    .from('member_renewal_requests')
    .select('id, member_id, request_type, months, plan_name, duration, status')
    .eq('id', id)
    .eq('gym_id', gym.id)
    .maybeSingle()
  if (readError) {
    log.error('Renewal request read failed', readError)
    return apiError(500, 'SERVER_ERROR', 'Could not load the request.')
  }
  if (!request) return apiError(404, 'NOT_FOUND', 'Request not found')
  if (request.status !== 'pending') return apiError(409, 'NOT_PENDING', 'This request was already reviewed.')

  if (request.request_type === 'due') {
    // Same effect as the owner's Collect action, done atomically in the database.
    const { data: result, error: dueError } = await supabase.rpc('approve_member_due_payment_request', { p_request_id: id })
    if (dueError || !result) {
      if (dueError?.message === 'NOT_PENDING') return apiError(409, 'NOT_PENDING', 'This request was already reviewed.')
      if (dueError?.message === 'NOTHING_DUE') return apiError(409, 'NOTHING_DUE', 'This member has no pending amount.')
      if (dueError?.message === 'NOT_FOUND') return apiError(404, 'NOT_FOUND', 'Request not found')
      log.error('Approve due payment failed', dueError)
      return apiError(500, 'SERVER_ERROR', 'Could not approve the request. Please try again.')
    }
    try {
      await Promise.all([
        deleteCache(cacheKeys.paymentsAll(gym.id)),
        deleteCache(cacheKeys.dashboard(gym.id, todayIST())),
      ])
    } catch (err) {
      log.error('Due payment cache bust failed', err)
    }
    return apiSuccess(result as DueApproveResult)
  }

  if (parsed.data.start_date && !isStartDateInWindow(parsed.data.start_date, todayIST())) {
    return apiError(400, 'BAD_REQUEST', 'start_date must be within 30 days before and 365 days after today')
  }

  const { data: latest, error: latestError } = await supabase
    .from('memberships')
    .select('end_date')
    .eq('member_id', request.member_id)
    .eq('gym_id', gym.id)
    .order('end_date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (latestError) {
    log.error('Latest membership read failed', latestError)
    return apiError(500, 'SERVER_ERROR', 'Could not load the member.')
  }
  const previousEndDate = latest?.end_date ?? null

  const startDate = parsed.data.start_date ?? renewalStartDate(previousEndDate, todayIST())
  const endDate = renewalEndDate(startDate, request.months as number)

  const { data: membershipId, error } = await supabase.rpc('approve_member_renewal_request', {
    p_request_id: id,
    p_start_date: startDate,
    p_end_date: endDate,
  })
  if (error || !membershipId) {
    if (error?.message === 'NOT_PENDING') return apiError(409, 'NOT_PENDING', 'This request was already reviewed.')
    if (error?.message === 'NOT_FOUND') return apiError(404, 'NOT_FOUND', 'Request not found')
    log.error('Approve renewal failed', error)
    return apiError(500, 'SERVER_ERROR', 'Could not approve the request. Please try again.')
  }

  // Best effort from here: the membership is saved, so nothing below may fail the response.
  try {
    await Promise.all([
      deleteCache(cacheKeys.paymentsAll(gym.id)),
      deleteCache(cacheKeys.dashboard(gym.id, todayIST())),
    ])
  } catch (err) {
    log.error('Renewal cache bust failed', err)
  }
  try {
    const { data: member } = await supabase
      .from('members')
      .select('id, name, phone')
      .eq('id', request.member_id)
      .eq('gym_id', gym.id)
      .maybeSingle()
    if (member?.phone) {
      await sendRenewalMessage({
        gymId: gym.id,
        gymName: gym.name ?? '',
        memberId: member.id,
        memberName: member.name,
        phone: member.phone,
        plan: request.duration as string,
        validUntil: endDate,
      })
      if (previousEndDate) {
        await cancelReminderCycles({
          gymId: gym.id,
          memberId: member.id,
          phone: member.phone,
          templates: ['membership_expiry_reminder', 'membership_expired'],
          triggerDate: previousEndDate,
        })
      }
    }
  } catch (err) {
    log.error('Renewal WhatsApp step failed', err)
  }

  return apiSuccess({ membershipId, startDate, endDate })
}, { rateLimit: 30 })
