import 'server-only'
import { logger } from '@/lib/logger'
import type { PushJob } from '@/types/push'
import { isPushConfigured } from './config'

/**
 * Hands a push job to the QStash worker (POST /api/push/send). Fire-and-forget: it never throws, so a
 * trigger inside an owner's request cannot fail or slow it. Without QSTASH_TOKEN (local dev) it sends
 * inline in the background instead. A no-op when push is not configured.
 */
export async function publishPushJob(job: PushJob): Promise<void> {
  if (!isPushConfigured()) return
  try {
    const token = process.env.QSTASH_TOKEN
    const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, '')
    if (!token || !base) {
      // Local dev: QStash cannot reach localhost. Not awaited, so the caller is not slowed.
      void import('./send')
        .then(m => m.sendPushToMembers(job))
        .catch(err => logger.error('push_inline_send_failed', { error: err instanceof Error ? err.message : String(err) }))
      return
    }

    const qstashBase = (process.env.QSTASH_URL || 'https://qstash.upstash.io').replace(/\/$/, '')
    // A continuation (cursor set) is a different delivery from the first page, so the cursor is part of the id.
    const dedupeId = `push-${job.kind}-${job.ref}-${job.gymId}${job.cursor ? `-${job.cursor}` : ''}`
    const res = await fetch(`${qstashBase}/v2/publish/` + encodeURIComponent(`${base}/api/push/send`), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Upstash-Deduplication-Id': dedupeId,
      },
      body: JSON.stringify(job),
    })
    if (!res.ok) logger.error('push_publish_failed', { status: res.status, kind: job.kind })
  } catch (err) {
    logger.error('push_publish_error', { error: err instanceof Error ? err.message : String(err) })
  }
}
