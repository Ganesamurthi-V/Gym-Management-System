'use server'

import { resolveSentryIssue } from '@/lib/sentry-api'
import { revalidatePath } from 'next/cache'
import { getAdminSession } from '@/lib/auth'

export async function resolveErrorAction(issueId: string) {
  // Server Actions are public POST endpoints; do not rely on middleware alone.
  if (!(await getAdminSession())) return { success: false, error: 'Unauthorized' }
  try {
    await resolveSentryIssue(issueId)
    // Revalidate the errors page and dashboard so the count updates instantly
    revalidatePath('/errors')
    revalidatePath('/dashboard')
    return { success: true }
  } catch (error: any) {
    console.error('Failed to resolve error:', error)
    return { success: false, error: error.message }
  }
}
