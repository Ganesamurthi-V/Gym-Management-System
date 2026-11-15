'use client'

import { RefreshCw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { AwsRange } from '@/lib/aws/types'

export const RANGES: AwsRange[] = ['1h', '24h', '7d']

export function RangeControls({ range, loading, onRange, onRefresh }: {
  range: AwsRange
  loading: boolean
  onRange: (r: AwsRange) => void
  onRefresh: () => void
}) {
  return (
    <>
      <ToggleGroup
        type="single"
        variant="outline"
        size="sm"
        value={range}
        onValueChange={(v) => v && onRange(v as AwsRange)}
        aria-label="Time range"
      >
        {RANGES.map((r) => (
          <ToggleGroupItem key={r} value={r}>{r}</ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
        <RefreshCw className={loading ? 'animate-spin' : ''} />
        Refresh
      </Button>
    </>
  )
}
