import { logger } from '@/lib/logger'

/**
 * Pings a Better Stack heartbeat URL after a cron run succeeded. Never throws: a
 * monitoring hiccup must not fail the cron. The URL holds a secret token, so it is
 * never logged.
 */
export async function pingHeartbeat(url: string | undefined): Promise<void> {
  if (!url) return
  try {
    await fetch(url, { method: 'GET', signal: AbortSignal.timeout(3000) })
  } catch {
    logger.warn('Heartbeat ping failed')
  }
}
