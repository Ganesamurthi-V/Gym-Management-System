import { Loader2 } from 'lucide-react'

export default function GlobalLoading() {
  return (
    <div className="flex flex-col items-center justify-center w-full h-[60vh] gap-4">
      <Loader2 className="w-8 h-8 animate-spin text-brand-500" />
      <p className="text-sm font-semibold text-slate-500 animate-pulse">Loading data...</p>
    </div>
  )
}
