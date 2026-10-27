export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl mx-auto">
      <div className="space-y-2">
        <div className="w-40 h-7 bg-slate-100 skeleton rounded-lg" />
        <div className="w-64 h-4 bg-slate-100 skeleton rounded-md" />
      </div>
      <div className="card h-80 skeleton" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card h-28 skeleton" />
      ))}
    </div>
  )
}
