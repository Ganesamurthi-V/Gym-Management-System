import {
  User, Phone, Mail, MapPin, Calendar, Heart, Shield,
} from 'lucide-react'
import { getMemberWithGym } from '@/lib/member-data'
import { formatDate } from '@/lib/member-utils'
import { startPageTimer } from '@/lib/perf'
import { LogoutButton } from '@/components/auth/LogoutButton'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

function InfoRow({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string | null | undefined
}) {
  if (!value) return null
  return (
    <div className="flex items-start gap-3 py-3">
      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</p>
        <p className="mt-0.5 text-sm font-semibold text-slate-800 break-words">{value}</p>
      </div>
    </div>
  )
}

export default async function ProfilePage() {
  const done = startPageTimer('profile')

  // Single joined query for member + gym
  const data = await getMemberWithGym()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load profile.</p></div>
  }
  const { member, gym } = data

  done()

  const memberCode = member.member_code ?? `GF${String(member.member_number).padStart(5, '0')}`

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Profile</h1>
      </header>

      {/* Avatar + name */}
      <section className="card mb-5 p-5">
        <div className="flex items-center gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-400 to-brand-600 text-2xl font-bold text-white shadow-md">
            {member.name.charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0">
            <p className="truncate text-xl font-bold text-slate-900">{member.name}</p>
            <p className="text-xs font-bold text-brand-600">{memberCode}</p>
            <p className="mt-0.5 text-xs text-slate-500">{gym.name}</p>
          </div>
        </div>

        {/* Joined */}
        <div className="mt-4 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2">
          <Calendar className="h-4 w-4 text-slate-400 shrink-0" />
          <p className="text-xs text-slate-500">
            Member since <span className="font-semibold text-slate-700">{formatDate(member.created_at)}</span>
          </p>
        </div>
      </section>

      {/* Personal details */}
      <section className="card mb-5 divide-y divide-slate-100 px-4">
        <p className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Personal Details</p>
        <InfoRow icon={Phone}  label="Phone"       value={member.phone} />
        <InfoRow icon={Mail}   label="Email"       value={member.email} />
        <InfoRow icon={User}   label="Gender"      value={member.gender ? member.gender.charAt(0).toUpperCase() + member.gender.slice(1) : null} />
        <InfoRow icon={Calendar} label="Date of Birth" value={member.date_of_birth ? formatDate(member.date_of_birth) : null} />
        <InfoRow icon={MapPin} label="Area"        value={member.area} />
        <InfoRow icon={Heart}  label="Blood Group" value={member.blood_group} />
      </section>

      {/* Emergency contact */}
      {(member.emergency_name || member.emergency_phone) && (
        <section className="card mb-5 divide-y divide-slate-100 px-4">
          <p className="py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400">Emergency Contact</p>
          <InfoRow icon={User}  label="Contact Name"   value={member.emergency_name} />
          <InfoRow icon={Phone} label="Contact Phone"  value={member.emergency_phone} />
        </section>
      )}

      {/* Medical */}
      {member.medical_notes && (
        <section className="card mb-5 p-4">
          <div className="flex items-start gap-3">
            <Shield className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Medical Notes</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-700">{member.medical_notes}</p>
            </div>
          </div>
        </section>
      )}

      {/* Sign out */}
      <section className="card p-4">
        <LogoutButton />
      </section>

    </div>
  )
}
