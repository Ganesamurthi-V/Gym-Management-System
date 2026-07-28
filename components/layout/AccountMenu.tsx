'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, User, Settings, Lock, Bell, ChevronRight } from 'lucide-react'
import { useRealtimeChannel } from '@/lib/hooks/useRealtimeChannel'
import { useRealtimeInvalidation } from '@/lib/hooks/useRealtimeInvalidation'

interface AccountMenuProps {
  initialEmail?: string | null
  initialGymId?: string | null
  initialGymName?: string | null
  initialUnreadCount?: number
}

export default function AccountMenu({ initialEmail, initialGymId, initialGymName, initialUnreadCount }: AccountMenuProps = {}) {
  const [isOpen, setIsOpen] = useState(false)
  const [email, setEmail] = useState<string | null>(initialEmail ?? null)
  const [gymId, setGymId] = useState<string | null>(initialGymId ?? null)
  const [gymName, setGymName] = useState<string | null>(initialGymName ?? null)
  const [unreadCount, setUnreadCount] = useState(initialUnreadCount ?? 0)
  const [toastMessage, setToastMessage] = useState<{ id: string, title: string, body: string } | null>(null)
  const currentUserId = useRef<string | null>(null)
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
      setGymId(gym?.id ?? null)

      if (gym?.id) {
        const { count } = await supabase
          .from('admin_messages')
          .select('*', { count: 'exact', head: true })
          .eq('gym_id', gym.id)
          .is('read_at', null)
        setUnreadCount(count ?? 0)
      }
    }

    // Re-fetch whenever auth state changes (login / logout / account switch)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event: string, session: { user: { id: string; email?: string } } | null) => {
        if (session?.user) {
          if (currentUserId.current === session.user.id) return
          currentUserId.current = session.user.id

          // Use server-rendered props only when we have all of them AND the
          // session belongs to the same user the server rendered for.
          // If initialGymId or initialGymName is missing (e.g. mid-onboarding),
          // fall through to fetchForUser so we don't silently show stale/empty state.
          const isSameUser = session.user.email === initialEmail
          const haveAllProps = initialGymId && initialGymName

          if (isSameUser && haveAllProps) {
            setEmail(initialEmail ?? null)
            setGymId(initialGymId ?? null)
            setGymName(initialGymName ?? null)
            setUnreadCount(initialUnreadCount ?? 0)
          } else {
            fetchForUser(session.user.id, session.user.email ?? '')
          }
        } else {
          currentUserId.current = null
          setEmail(null)
          setGymName(null)
          setGymId(null)
          setUnreadCount(0)
        }
      }
    )

    return () => subscription.unsubscribe()
  }, [supabase, initialEmail, initialGymId, initialGymName, initialUnreadCount])

  // Sync prop changes from ShellGuard (for instant name updates)
  useEffect(() => {
    if (initialGymName && initialGymName !== gymName) {
      setGymName(initialGymName)
    }
  }, [initialGymName, gymName])

  const syncUnreadCount = useCallback(async () => {
    if (!gymId) return
    const { count } = await supabase
      .from('admin_messages')
      .select('*', { count: 'exact', head: true })
      .eq('gym_id', gymId)
      .is('read_at', null)
    setUnreadCount(count ?? 0)
  }, [gymId, supabase])

  useRealtimeChannel({
    channelName: `owner_account_messages_${gymId ?? 'disabled'}`,
    enabled: Boolean(gymId),
    subscriptions: [
      {
        type: 'postgres_changes',
        filter: {
          event: 'INSERT',
          schema: 'public',
          table: 'admin_messages',
          filter: `gym_id=eq.${gymId ?? '00000000-0000-0000-0000-000000000000'}`,
        },
        callback: async (payload) => {
          await syncUnreadCount()
          if (!payload.new?.id) return

          const { data: newMessage } = await supabase
            .from('admin_messages')
            .select('id, subject, body')
            .eq('id', payload.new.id)
            .single()

          if (!newMessage) return
          setToastMessage({
            id: newMessage.id,
            title: newMessage.subject || 'New Support Message',
            body: newMessage.body,
          })
          window.setTimeout(() => {
            setToastMessage((previous) => previous?.id === newMessage.id ? null : previous)
          }, 6_000)
        },
      },
      {
        type: 'postgres_changes',
        filter: {
          event: 'UPDATE',
          schema: 'public',
          table: 'admin_messages',
          filter: `gym_id=eq.${gymId ?? '00000000-0000-0000-0000-000000000000'}`,
        },
        callback: syncUnreadCount,
      },
    ],
    onResync: syncUnreadCount,
  })

  useRealtimeInvalidation({
    channelName: `gym:${gymId ?? 'disabled'}:support`,
    enabled: Boolean(gymId),
    privateChannel: true,
    onInvalidate: syncUnreadCount,
  })

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
          <div className="fixed md:absolute top-14 md:top-full left-3 right-3 xs:left-4 xs:right-4 md:left-auto md:right-0 mt-2 md:w-64 bg-white rounded-2xl shadow-xl border border-slate-100 z-50 overflow-hidden transition-all animate-pop-in">
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
                        <span className="text-[8px] font-bold text-white leading-none">{unreadCount > 99 ? '99+' : unreadCount}</span>
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

      {/* Real-time Side Notification Toast */}
      {toastMessage && (
        <div 
          onClick={() => {
            setToastMessage(null)
            router.push('/account/notifications')
          }}
          className="fixed bottom-6 right-6 z-[100] bg-white border border-slate-100 shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl p-4 flex gap-4 items-start w-[320px] cursor-pointer hover:bg-slate-50 transition-all animate-pop-in group"
        >
          <div className="w-10 h-10 bg-brand-50 text-brand-600 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 relative">
            <Bell className="w-5 h-5" />
            <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-500 border-2 border-white rounded-full animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{toastMessage.title}</p>
            <p className="text-xs font-medium text-slate-500 mt-0.5 line-clamp-2">{toastMessage.body}</p>
            <div className="flex items-center gap-1 text-[10px] font-bold text-brand-600 mt-2 opacity-80 group-hover:opacity-100 transition-opacity">
              <span>View message</span>
              <ChevronRight className="w-3 h-3" />
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
