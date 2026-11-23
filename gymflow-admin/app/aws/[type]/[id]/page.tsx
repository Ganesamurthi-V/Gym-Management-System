import { notFound } from 'next/navigation'
import { getAwsResourceDetail } from '@/lib/aws/detail'
import type { AwsRange, AwsResourceDetail, AwsResourceType } from '@/lib/aws/types'
import ResourceDetailClient from './ResourceDetailClient'

export const dynamic = 'force-dynamic'

const TYPES: AwsResourceType[] = ['lambda', 'cloudfront', 'dynamodb', 's3']

export default async function AwsResourcePage({ params, searchParams }: {
  params: Promise<{ type: string; id: string }>
  searchParams: Promise<{ range?: string }>
}) {
  const { type, id: rawId } = await params
  const { range: rawRange } = await searchParams
  if (!TYPES.includes(type as AwsResourceType)) notFound()
  const resourceType = type as AwsResourceType
  let id = rawId
  try {
    id = decodeURIComponent(rawId)
  } catch {
    notFound()
  }
  const range: AwsRange = rawRange === '1h' || rawRange === '7d' ? rawRange : '24h'

  let initial: AwsResourceDetail | null = null
  let error: string | null = null
  try {
    initial = await getAwsResourceDetail(resourceType, id, range)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to load AWS resource'
    // The backend throws for unknown ids; map that to a 404 rather than an error banner.
    if (/not.?found|does not exist|no such/i.test(message)) notFound()
    error = message
  }
  return <ResourceDetailClient type={resourceType} id={id} initialRange={range} initial={initial} initialError={error} />
}
