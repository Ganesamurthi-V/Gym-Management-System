import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-8 w-20" />
      <div className="grid gap-2">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full rounded-xl" />
        <Skeleton className="h-72 w-full rounded-xl" />
      </div>
    </div>
  )
}
