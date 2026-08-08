'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import type { AuthChangeEvent } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

export function SessionLifecycle() {
  const pathname = usePathname()
  const router = useRouter()

  useEffect(() => {
    let supabase: ReturnType<typeof createClient>

    try {
      supabase = createClient()
    } catch {
      return
    }

    // `AuthChangeEvent` is annotated explicitly because the shared browser
    // client in this project is intentionally untyped (no `Database` generic),
    // so the callback parameter has no contextual type to infer from.
    const { data: listener } = supabase.auth.onAuthStateChange((event: AuthChangeEvent) => {
      if (event === 'SIGNED_OUT' && !pathname.startsWith('/auth/')) {
        router.replace('/auth/login')
        router.refresh()
      }
    })

    const refreshOnForeground = async () => {
      if (document.visibilityState !== 'visible') return
      const { data } = await supabase.auth.getSession()
      if (data.session) await supabase.auth.refreshSession()
    }

    document.addEventListener('visibilitychange', refreshOnForeground)
    return () => {
      listener.subscription.unsubscribe()
      document.removeEventListener('visibilitychange', refreshOnForeground)
    }
  }, [pathname, router])

  return null
}
