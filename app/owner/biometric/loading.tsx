export default function Loading() {
  return (
    <div className="space-y-4 md:space-y-5 max-w-3xl mx-auto">
      <div className="w-40 h-7 bg-slate-100 skeleton rounded-lg" />
      {[...Array(3)].map((_, i) => (
        <div key={i} className="card p-4 space-y-3">
          <div className="w-44 h-5 bg-slate-100 skeleton rounded-md" />
          <div className="w-full h-11 bg-slate-100 skeleton rounded-xl" />
          <div className="w-2/3 h-4 bg-slate-100 skeleton rounded-md" />
        </div>
      ))}
    </div>
  )
}
