/**
 * POST /api/whatsapp/automation/import-batch
 *
 * Called (fire-and-forget) right after a bulk import finishes. Immediately
 * fires the expiry-reminder / expired templates for the just-imported members
 * so they don't have to wait for the next daily cron run.
 *
 * Expired members are notified only if they lapsed within the last 2 months
 * (IMPORT_EXPIRED_WINDOW_DAYS); longer-inactive members receive nothing.
 * Welcome messages are never sent here.
 *
 * Auth: must be the logged-in owner of the gym these members belong to. The
 * request carries only member ids; the runner loads phone and name from the
 * member rows, scoped to the owner's gym.
 *
 * Body: { memberIds: string[] }   // UUIDs, max 500
 */

import { NextResponse } from 'next/server'
import { withAuth } from '@/lib/api/withAuth'
import { runImportBatchAutomation } from '@/lib/whatsapp/automation'
import { z } from 'zod'

export const dynamic = 'force-dynamic'
export const maxDuration = 60 // sending to a large batch can take a while

const schema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(500),
})

// One call covers a whole import (up to 500 members), so the per-owner limit is low.
export const POST = withAuth('WHATSAPP_AUTOMATION_IMPORT_BATCH', async (req, { gym }) => {
  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ success: false, error: 'Invalid JSON' }, { status: 400 })
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: 'Invalid body' }, { status: 400 })
  }

  // Members are scoped to the caller's gym inside the runner, so a caller can only
  // trigger sends for members in their own gym.
  const stats = await runImportBatchAutomation({
    gymId: gym.id,
    memberIds: parsed.data.memberIds,
  })

  return NextResponse.json({ success: true, stats })
}, { rateLimit: 5 })
