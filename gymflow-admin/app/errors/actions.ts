'use server'

import { resolveSentryIssue } from '@/lib/sentry-api'
import { revalidatePath } from 'next/cache'

export async function resolveErrorAction(issueId: string) {
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
