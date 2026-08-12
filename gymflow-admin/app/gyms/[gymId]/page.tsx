import { createAdminClient } from '@/lib/supabase-admin'
import { notFound } from 'next/navigation'
import { ArrowLeft, Mail, User, ShieldCheck, Database, CalendarClock, BadgeCheck, Phone } from 'lucide-react'
import Link from 'next/link'
import PasswordResetForm from './PasswordResetForm'
import GymStatusToggle from './GymStatusToggle'
import SubscriptionPanel from './SubscriptionPanel'

export const dynamic = 'force-dynamic'

export default async function GymDetailPage({ params }: { params: Promise<{ gymId: string }> }) {
  const { gymId } = await params
  const supabase = createAdminClient()

  const gymRes = await supabase.from('gyms').select('id, name, owner_id, created_at, is_active').eq('id', gymId).single()

  if (gymRes.error || !gymRes.data) notFound()

  const gym = gymRes.data
  
  // Fetch owner details
  const { data: { user: owner } } = await supabase.auth.admin.getUserById(gym.owner_id)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href="/gyms" className="admin-btn-ghost -ml-2">
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-white">{gym.name}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            Registered {new Date(gym.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <User className="w-4 h-4 text-sky-400" />
            <span className="text-xs text-slate-500">Owner ID</span>
          </div>
          <p className="text-xs font-mono font-medium text-slate-300 mt-1 break-all">{gym.owner_id}</p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <Database className="w-4 h-4 text-indigo-400" />
            <span className="text-xs text-slate-500">Database ID (Gym)</span>
          </div>
          <p className="text-xs font-mono font-medium text-slate-300 mt-1 break-all">{gym.id}</p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <CalendarClock className="w-4 h-4 text-emerald-400" />
            <span className="text-xs text-slate-500">Account Created</span>
          </div>
          <p className="text-sm font-bold text-white mt-1">
            {owner?.created_at ? new Date(owner.created_at).toLocaleDateString('en-IN') : 'Unknown'}
          </p>
        </div>
        <div className="admin-card p-4">
          <div className="flex items-center gap-2 mb-1">
            <BadgeCheck className={`w-4 h-4 ${owner?.email_confirmed_at ? 'text-purple-400' : 'text-amber-400'}`} />
            <span className="text-xs text-slate-500">Email Verified</span>
          </div>
          <p className="text-sm font-bold text-white mt-1">
            {owner?.email_confirmed_at ? 'Yes, Verified' : 'Pending'}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Account Details */}
        <div className="admin-card p-5 space-y-6">
          <div className="flex items-center gap-2 border-b border-[#1f2937] pb-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-white">Gym Owner Details</h2>
          </div>
          
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Primary Email</p>
              <div className="flex items-center gap-2 text-slate-300">
                <Mail className="w-4 h-4 text-slate-400" />
                <span>{owner?.email ?? 'No email found'}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Phone Number</p>
              <div className="flex items-center gap-2 text-slate-300">
                <Phone className="w-4 h-4 text-slate-400" />
                <span>{owner?.user_metadata?.mobile_number || owner?.phone || 'Not provided'}</span>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Owner Name</p>
              <p className="text-sm text-slate-300">
                {owner?.user_metadata?.full_name || owner?.user_metadata?.name || 'Not provided'}
              </p>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Auth Status</p>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active Account
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Last Sign In</p>
              <p className="text-sm text-slate-400">
                {owner?.last_sign_in_at ? new Date(owner.last_sign_in_at).toLocaleString('en-IN') : 'Never'}
              </p>
            </div>
          </div>
        </div>

        {/* Security & Password */}
        <div className="space-y-6">
          <PasswordResetForm userId={gym.owner_id} />
          <GymStatusToggle gymId={gym.id} isActive={gym.is_active} gymName={gym.name} />
        </div>
      </div>

      {/* Subscription Management */}
      <SubscriptionPanel gymId={gym.id} gymName={gym.name} />
    </div>
  )
}
