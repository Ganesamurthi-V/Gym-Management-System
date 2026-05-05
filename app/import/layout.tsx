// import { BottomNav } from '@/components/layout/BottomNav'

export default function ImportLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <main className="max-w-lg mx-auto pb-24">{children}</main>
      {/* <BottomNav /> */}
    </div>
  )
}
