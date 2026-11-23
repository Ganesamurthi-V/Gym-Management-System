import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="grid gap-2">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      <Skeleton className="h-8 w-full lg:w-80" />
      <Skeleton className="h-96 w-full rounded-lg" />
    </div>
  )
}
