import { Skeleton } from '@/components/ui/skeleton'

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="grid gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-8 w-40" />
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-36 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-80 rounded-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
