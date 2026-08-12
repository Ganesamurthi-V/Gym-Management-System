'use client'

import { LogOut } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import toast from 'react-hot-toast'
import { signOutViaApi } from '@/lib/auth/client-auth'

export function LogoutButton() {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function logout() {
    setLoading(true)
    try {
      const signedOut = await signOutViaApi('local')
      if (!signedOut) throw new Error('Sign-out request failed')

      if ('caches' in window) {
        const cacheNames = await caches.keys()
        await Promise.all(cacheNames.map((name) => caches.delete(name)))
      }
      Object.keys(localStorage)
        .filter((key) => key.startsWith('gymflow-member:'))
        .forEach((key) => localStorage.removeItem(key))
      sessionStorage.clear()

      router.replace('/auth/login')
      router.refresh()
    } catch {
      toast.error('Could not sign out. Please try again.')
      setLoading(false)
    }
  }

  return (
    <button type="button" className="btn-secondary mt-5 text-red-700" onClick={logout} disabled={loading} aria-busy={loading}>
      <LogOut aria-hidden="true" className="h-5 w-5" />
      {loading ? 'Signing out…' : 'Sign out'}
    </button>
  )
}
