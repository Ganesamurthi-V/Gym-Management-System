import { NextRequest } from 'next/server'
import { withAuth, apiSuccess, apiError } from '@/lib/api/withAuth'
import { shouldPromptForFeedback } from '@/lib/feedback-prompt'

export const dynamic = 'force-dynamic'

/**
 * GET /api/feedback-prompt  →  { show: boolean }
 *
 * Should the owner be shown the feedback pop-up now? The rule lives in
 * lib/feedback-prompt.ts: first 30 days of the gym, once onboarding is done, at most every
 * 3 days, and never after feedback has been sent. "Has sent feedback" is any support_tickets
 * row of type 'feedback' for the gym, so feedback given from the Support menu counts as well
 * as feedback given from the pop-up.
 *
 * If anything cannot be read (for example the owner_feedback_prompts migration has not been
 * run yet), the answer is "do not show": a pop-up that cannot record that it was shown would
 * come back on every page load.
 */
export const GET = withAuth('FEEDBACK_PROMPT_GET', async (_req: NextRequest, { supabase, gym, log }) => {
  const [gymRes, feedbackRes, promptRes] = await Promise.all([
    supabase.from('gyms').select('created_at, onboarding_completed').eq('id', gym.id).maybeSingle(),
    supabase.from('support_tickets').select('id').eq('gym_id', gym.id).eq('type', 'feedback').limit(1),
    supabase.from('owner_feedback_prompts').select('last_shown_at').eq('gym_id', gym.id).maybeSingle(),
  ])

  if (gymRes.error || feedbackRes.error || promptRes.error) {
    log.warn('Feedback prompt check could not read its data', {
      gym: gymRes.error?.message,
      feedback: feedbackRes.error?.message,
      prompt: promptRes.error?.message,
    })
    return apiSuccess({ show: false })
  }

  const decision = shouldPromptForFeedback({
    now: new Date(),
    gymCreatedAt: gymRes.data?.created_at ?? null,
    onboardingCompleted: gymRes.data?.onboarding_completed === true,
    hasFeedback: (feedbackRes.data?.length ?? 0) > 0,
    lastShownAt: promptRes.data?.last_shown_at ?? null,
  })

  return apiSuccess({ show: decision.show })
})

/**
 * POST /api/feedback-prompt  { action: 'shown' }
 *
 * Records that the pop-up was shown now, which starts the 3-day wait. Called when it appears,
 * not when it is closed, so closing the tab without touching it still counts.
 */
export const POST = withAuth('FEEDBACK_PROMPT_SHOWN', async (req: NextRequest, { supabase, gym, log }) => {
  const body = await req.json().catch(() => null) as { action?: string } | null
  if (body?.action !== 'shown') return apiError(400, 'BAD_REQUEST', 'Unknown action')

  const { data: prev } = await supabase
    .from('owner_feedback_prompts')
    .select('shown_count')
    .eq('gym_id', gym.id)
    .maybeSingle()

  const { error } = await supabase.from('owner_feedback_prompts').upsert(
    {
      gym_id: gym.id,
      last_shown_at: new Date().toISOString(),
      shown_count: ((prev?.shown_count as number | undefined) ?? 0) + 1,
    },
    { onConflict: 'gym_id' },
  )
  if (error) {
    log.warn('Could not record that the feedback prompt was shown', { error: error.message })
    return apiError(500, 'SAVE_FAILED', 'Could not save')
  }
  return apiSuccess({ ok: true })
})
