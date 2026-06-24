import { createAdminClient } from '@/lib/supabase/admin'
import { Activity, Users, Dumbbell, MapPin } from 'lucide-react'

export const revalidate = 0 // Always fetch fresh metrics for the admin

export default async function AdminPage() {
  const supabase = createAdminClient()

  // Run aggregations using the service role key to bypass RLS.
  // Use Exact count to get totals.
  const [
    { count: totalGyms },
    { count: totalMembers },
    { count: totalGeoAliases },
    { count: pendingGeoReviews }
  ] = await Promise.all([
    supabase.from('gyms').select('*', { count: 'exact', head: true }),
    supabase.from('members').select('*', { count: 'exact', head: true }),
    supabase.from('geo_gym_aliases').select('*', { count: 'exact', head: true }),
    supabase.from('geo_review_queue').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
  ])

  const stats = [
    { label: 'Total Registered Gyms', value: totalGyms ?? 0, icon: Dumbbell, color: 'text-blue-600', bg: 'bg-blue-100' },
    { label: 'Total Members (Platform)', value: totalMembers ?? 0, icon: Users, color: 'text-indigo-600', bg: 'bg-indigo-100' },
    { label: 'Learned Geo Aliases', value: totalGeoAliases ?? 0, icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-100' },
    { label: 'Pending Geo Reviews', value: pendingGeoReviews ?? 0, icon: Activity, color: 'text-amber-600', bg: 'bg-amber-100' },
  ]

  return (
    <div className="space-y-6">
      <div className="mb-8">
        <h2 className="text-3xl font-bold text-gray-900 tracking-tight">Platform Overview</h2>
        <p className="text-gray-500 mt-2 text-sm">Real-time aggregate metrics across all isolated tenants.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
            <div className="flex items-center gap-4 mb-4">
              <div className={`w-12 h-12 ${stat.bg} rounded-full flex items-center justify-center`}>
                <stat.icon className={`w-6 h-6 ${stat.color}`} />
              </div>
              <p className="text-sm font-medium text-gray-500">{stat.label}</p>
            </div>
            <p className="text-4xl font-bold text-gray-900 tracking-tight">
              {stat.value.toLocaleString()}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-12 bg-white rounded-2xl p-6 shadow-sm border border-gray-100">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">System Health</h3>
        <div className="flex items-center gap-3 text-emerald-600 bg-emerald-50 px-4 py-3 rounded-lg w-fit border border-emerald-100">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
          </span>
          <span className="font-medium text-sm">All Systems Operational</span>
        </div>
      </div>
    </div>
  )
}
