'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Settings, Lock, Bell, ChevronRight } from 'lucide-react'

export default function AccountMenu() {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [gymName, setGymName] = useState<string | null>(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    async function fetchForUser(userId: string, userEmail: string) {
      setEmail(userEmail)
      const { data: gym } = await supabase
        .from('gyms')
        .select('id, name')
        .eq('owner_id', userId)
        .single()
      setGymName(gym?.name ?? null)

      if (gym?.id) {
        const { count } = await supabase
          .from('admin_messages')
          .select('*', { count: 'exact', head: true })
          .eq('gym_id', gym.id)
          .is('read_at', null)
        setUnreadCount(count ?? 0)
      }
    }

    // Initial load
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: { id: string; email?: string } | null } }) => {
      if (user) fetchForUser(user.id, user.email ?? '')
    })

    // Re-fetch whenever auth state changes (login / logout / account switch)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: { id: string; email?: string } } | null) => {
        if (session?.user) {
          fetchForUser(session.user.id, session.user.email ?? '')
        } else {
          setEmail(null)
          setGymName(null)
          setUnreadCount(0)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  // Show gym name initials (up to 2 words), fallback to email initials
  const initials = gymName
    ? gymName.trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
    : email
    ? email.substring(0, 2).toUpperCase()
    : 'GY'

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative w-8 h-8 bg-gradient-to-br from-brand-100 to-brand-200 rounded-full flex items-center justify-center hover:ring-2 hover:ring-brand-300 transition-all"
        title={gymName ?? email ?? ''}
      >
        <span className="text-brand-700 font-bold text-xs">{initials}</span>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full" />
        )}
      </button>

      {isOpen && (
        <>
          {/* Mobile Overlay */}
          <div className="fixed inset-0 bg-black/20 z-40 md:hidden" onClick={() => setIsOpen(false)} />

          {/* Dropdown Panel */}
          <div className="fixed md:absolute top-14 md:top-full left-4 right-4 md:left-auto md:right-0 mt-2 md:w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden transition-all animate-pop-in">
            <div className="p-4 border-b border-slate-50">
              {gymName && <p className="text-sm font-bold text-slate-900 truncate">{gymName}</p>}
              <p className="text-xs font-medium text-slate-400 truncate mt-0.5">{email}</p>
            </div>

            <div className="p-2">
              <Link href="/account" onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-brand-50 rounded-lg flex items-center justify-center text-brand-600">
                    <User className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Account Settings</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
              </Link>

              <Link href="/account" onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-cyan-50 rounded-lg flex items-center justify-center text-cyan-600">
                    <Settings className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Edit Gym Name</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
              </Link>

              <Link href="/account" onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-purple-50 rounded-lg flex items-center justify-center text-purple-600">
                    <Lock className="w-4 h-4" />
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Change Password</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
              </Link>

              <Link href="/account/notifications" onClick={() => setIsOpen(false)}
                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <div className="relative w-8 h-8 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                    <Bell className="w-4 h-4" />
                    {unreadCount > 0 && (
                      <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 border-2 border-white rounded-full flex items-center justify-center">
                        <span className="text-[8px] font-bold text-white leading-none">{unreadCount}</span>
                      </span>
                    )}
                  </div>
                  <span className="text-sm font-semibold text-slate-700">Contact & Support</span>
                </div>
                <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-400" />
              </Link>
            </div>

            <div className="p-2 border-t border-slate-50">
              <button onClick={handleLogout}
                className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-red-50 text-red-600 transition-colors"
              >
                <div className="w-8 h-8 bg-red-50 rounded-lg flex items-center justify-center">
                  <LogOut className="w-4 h-4" />
                </div>
                <span className="text-sm font-bold">Logout</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
