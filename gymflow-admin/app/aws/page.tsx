import { getAwsOverview } from '@/lib/aws/overview'
import type { AwsMonitorOverview, AwsRange } from '@/lib/aws/types'
import AwsMonitorClient from './AwsMonitorClient'

export const dynamic = 'force-dynamic'

export default async function AwsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const { range: rawRange } = await searchParams
  // The detail pages link back with ?range= so the chosen window survives the round trip.
  const range: AwsRange = rawRange === '1h' || rawRange === '7d' ? rawRange : '24h'
  let initial: AwsMonitorOverview | null = null
  let error: string | null = null
  try {
    initial = await getAwsOverview(range)
  } catch (e) {
    error = e instanceof Error ? e.message : 'Failed to load AWS data'
  }
  return <AwsMonitorClient initial={initial} initialError={error} />
}
