export default function Loading() {
  return (
    <div className="relative w-full h-[85vh] flex flex-col items-center justify-center p-4 md:p-8 overflow-hidden rounded-3xl">
      
      {/* Session Toggle skeleton */}
      <div className="absolute top-6 right-6 md:top-8 md:right-8 z-20">
        <div className="w-40 h-10 bg-slate-100 skeleton rounded-full" />
      </div>

      <div className="w-full max-w-5xl flex flex-col items-center z-10">
        
        {/* Headers */}
        <div className="text-center mb-10 md:mb-12 flex flex-col items-center space-y-4">
          <div className="w-64 md:w-96 h-12 md:h-14 bg-slate-100 skeleton rounded-2xl" />
          <div className="w-48 h-6 bg-slate-100 skeleton rounded-lg" />
          <div className="w-32 h-4 bg-slate-100 skeleton rounded-md mt-2" />
        </div>

        {/* Form area */}
        <div className="w-full flex flex-col items-center">
          <div className="w-full max-w-2xl space-y-6 flex flex-col items-center">
            <div className="w-48 h-5 bg-slate-100 skeleton rounded-md" />
            <div className="w-full h-24 md:h-28 bg-slate-100 skeleton rounded-2xl" />
          </div>

          {/* Confirm Button */}
          <div className="w-full max-w-sm mt-10 h-14 md:h-16 bg-slate-100 skeleton rounded-full" />
        </div>

        {/* Checked-in counter */}
        <div className="mt-12 text-center flex justify-center">
          <div className="w-48 h-8 bg-slate-100 skeleton rounded-full" />
        </div>
      </div>
    </div>
  )
}
