'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Clock, CheckCircle, XCircle, AlertCircle, Wifi, WifiOff } from 'lucide-react'
import Link from 'next/link'
import toast from 'react-hot-toast'

interface SubStats {
  pendingSubscriptions: number
  trialGyms: number
  activeGyms: number
  expiredGyms: number
}

export default function AdminDashboardRealtime({ initial }: { initial: SubStats }) {
  const [stats, setStats] = useState(initial)
  const [isConnected, setIsConnected] = useState(false)

  useEffect(() => {
    const supabase = createClient()

    const channel = supabase
      .channel('admin_dashboard_realtime')
      // Listen for subscription_requests changes (new requests, approvals, rejections)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscription_requests',
        },
        (payload: any) => {
          if (payload.eventType === 'INSERT' && payload.new?.status === 'pending') {
            setStats(prev => ({ ...prev, pendingSubscriptions: prev.pendingSubscriptions + 1 }))
            toast('🔔 New subscription request!', { duration: 4000 })
          } else if (payload.eventType === 'UPDATE') {
            const oldStatus = payload.old?.status
            const newStatus = payload.new?.status
            if (oldStatus === 'pending' && newStatus !== 'pending') {
              // Request was reviewed — decrement pending count
              setStats(prev => ({
                ...prev,
                pendingSubscriptions: Math.max(0, prev.pendingSubscriptions - 1),
              }))
            }
          }
        }
      )
      // Listen for gyms table changes (subscription status transitions)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'gyms',
        },
        (payload: any) => {
          const oldStatus = payload.old?.subscription_status
          const newStatus = payload.new?.subscription_status

          if (oldStatus === newStatus) return

          setStats(prev => {
            const next = { ...prev }

            // Decrement old status counter
            if (oldStatus === 'trial') next.trialGyms = Math.max(0, next.trialGyms - 1)
            else if (oldStatus === 'active') next.activeGyms = Math.max(0, next.activeGyms - 1)
            else if (oldStatus === 'expired') next.expiredGyms = Math.max(0, next.expiredGyms - 1)

            // Increment new status counter
            if (newStatus === 'trial') next.trialGyms += 1
            else if (newStatus === 'active') next.activeGyms += 1
            else if (newStatus === 'expired') next.expiredGyms += 1

            return next
          })
        }
      )
      // Listen for new gym registrations
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'gyms',
        },
        (payload: any) => {
          const status = payload.new?.subscription_status
          setStats(prev => {
            const next = { ...prev }
            if (status === 'trial') next.trialGyms += 1
            else if (status === 'active') next.activeGyms += 1
            else if (status === 'expired') next.expiredGyms += 1
            return next
          })
          toast('🏋️ New gym registered!', { duration: 4000 })
        }
      )
      .subscribe((status: string) => {
        setIsConnected(status === 'SUBSCRIBED')
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const subStats = [
    { label: 'Pending Payment Reviews', value: stats.pendingSubscriptions, Icon: AlertCircle, color: 'text-amber-600', bg: 'bg-amber-100', urgent: stats.pendingSubscriptions > 0 },
    { label: 'On Free Trial', value: stats.trialGyms, Icon: Clock, color: 'text-brand-600', bg: 'bg-brand-100', urgent: false },
    { label: 'Active Subscriptions', value: stats.activeGyms, Icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-100', urgent: false },
    { label: 'Expired (No Sub)', value: stats.expiredGyms, Icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', urgent: stats.expiredGyms > 0 },
  ]

  return (
    <div className="mt-8">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-semibold text-gray-900">Subscription Overview</h3>
          <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${isConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
            {isConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            {isConnected ? 'Live' : '...'}
          </div>
        </div>
        <Link
          href="/admin/subscriptions"
          className="text-sm font-bold text-brand-600 hover:text-brand-700 flex items-center gap-1"
        >
          Manage Requests →
        </Link>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {subStats.map((stat, i) => (
          <div
            key={i}
            className={`bg-white rounded-2xl p-5 shadow-sm border transition-shadow hover:shadow-md ${
              stat.urgent ? 'border-amber-300 bg-amber-50' : 'border-gray-100'
            }`}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${stat.bg} rounded-full flex items-center justify-center`}>
                <stat.Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <p className="text-xs font-medium text-gray-500">{stat.label}</p>
            </div>
            <p className="text-3xl font-bold text-gray-900">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
